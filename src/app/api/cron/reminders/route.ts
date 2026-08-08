import { and, eq, isNull, lte } from 'drizzle-orm'
import { db } from '@/db'
import { documents, reminders, users } from '@/db/schema'
import { purgeExpiredAuthRows } from '@/lib/auth'
import { daysBetweenIso, formatDateHuman, todayIso } from '@/lib/dates'
import { appUrl, renderEmailHtml, sendEmail } from '@/lib/email'
import { recordEvent } from '@/lib/events'
import { formatMoney } from '@/lib/money'
import { purgeStaleRateLimits } from '@/lib/rate-limit-shared'
import { defaultReminderCopy, isReminderTone } from '@/lib/reminders'
import { getNiche } from '@/niches'
import { safeEqual } from '@/lib/tokens'

export const runtime = 'nodejs'
// Requested ceiling. Vercel Hobby caps functions at 10s regardless of this, so
// the sweep budgets its own time below rather than trusting it — see BUDGET_MS.
export const maxDuration = 60

/**
 * Stop sending and return cleanly before the platform kills us mid-batch.
 * Default 8s keeps us inside the 10s Hobby ceiling; set CRON_BUDGET_MS higher
 * (e.g. 50000) on Pro, where maxDuration above is honoured.
 *
 * Being killed is survivable — reminders are marked sent one at a time and the
 * query picks up everything still due — but exiting deliberately lets us
 * report the backlog instead of vanishing mid-run.
 */
const BUDGET_MS = Number(process.env.CRON_BUDGET_MS ?? 8000)

/** Bounded so one sweep cannot run away; the remainder waits for the next run. */
const BATCH_LIMIT = 200

/**
 * The daily sweep. Runs at 09:00 UTC via vercel.json.
 *
 * Selects `scheduled_for <= now` rather than "== today", so a cron run that is
 * late, or one that never fires, catches up on the next run instead of
 * silently dropping a reminder.
 */
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return Response.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })
  }

  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!safeEqual(provided, expected)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const now = new Date()
  const due = await db
    .select({ reminder: reminders, doc: documents, owner: users })
    .from(reminders)
    .innerJoin(documents, eq(documents.id, reminders.documentId))
    .leftJoin(users, eq(users.id, documents.ownerId))
    .where(
      and(
        eq(reminders.status, 'pending'),
        lte(reminders.scheduledFor, now),
        // Belt and braces: markDocumentPaid already cancels pending reminders,
        // but a paid invoice must never be chased even if that missed one.
        isNull(documents.paidAt),
      ),
    )
    .limit(BATCH_LIMIT)

  let sent = 0
  let skipped = 0
  let failed = 0
  let remaining = 0

  for (const row of due) {
    // Out of time: leave the rest pending. They are still `scheduled_for <=
    // now`, so the next run picks them up from the front.
    if (Date.now() - startedAt > BUDGET_MS) {
      remaining = due.length - (sent + skipped + failed)
      break
    }

    const { reminder, doc, owner } = row

    if (!doc.remindersEnabled || !doc.clientEmail || !owner) {
      await db
        .update(reminders)
        .set({ status: 'cancelled' })
        .where(eq(reminders.id, reminder.id))
      await recordEvent({
        documentId: doc.id,
        type: 'reminder_skipped',
        meta: { ruleKey: reminder.ruleKey, reason: 'disabled or missing recipient' },
      })
      skipped += 1
      continue
    }

    const tone = isReminderTone(doc.reminderTone) ? doc.reminderTone : 'friendly'
    const businessName = owner.businessName || owner.name || 'Your supplier'
    const daysOverdue = Math.max(0, daysBetweenIso(doc.dueDate, todayIso(now)))

    const copy = resolveCopy(doc.nicheSlug, reminder.ruleKey, tone, {
      clientName: doc.clientName ?? '',
      businessName,
      invoiceNumber: doc.number ?? 'your invoice',
      amount: formatMoney(doc.totalCents, doc.currency),
      dueDate: formatDateHuman(doc.dueDate),
      daysOverdue,
    })

    const invoiceUrl = `${appUrl()}/i/${doc.publicToken}`
    const result = await sendEmail({
      to: doc.clientEmail,
      subject: copy.subject,
      fromName: businessName,
      replyTo: owner.businessEmail || owner.email,
      text: `${copy.body}\n\nView and pay: ${invoiceUrl}`,
      html: renderEmailHtml({
        bodyText: copy.body,
        ctaLabel: 'View and pay invoice',
        ctaUrl: invoiceUrl,
        accentColor: doc.accentColor,
      }),
    })

    if (result.ok) {
      await db
        .update(reminders)
        .set({ status: 'sent', sentAt: new Date(), providerMessageId: result.id })
        .where(eq(reminders.id, reminder.id))
      await recordEvent({
        documentId: doc.id,
        type: 'reminder_sent',
        meta: { ruleKey: reminder.ruleKey, tone, daysOverdue },
      })
      sent += 1
    } else {
      // Left pending, so the next run retries rather than losing the nudge.
      await db
        .update(reminders)
        .set({ error: result.error })
        .where(eq(reminders.id, reminder.id))
      failed += 1
    }
  }

  // Housekeeping only if there is time left; sending reminders comes first.
  if (Date.now() - startedAt < BUDGET_MS) {
    await purgeExpiredAuthRows()
    await purgeStaleRateLimits()
  }

  return Response.json({
    ok: true,
    considered: due.length,
    sent,
    skipped,
    failed,
    durationMs: Date.now() - startedAt,
    // Both surfaced deliberately: a silently truncated batch would read as a
    // quiet day rather than a backlog. If either is persistently non-zero,
    // raise CRON_BUDGET_MS (on Pro) or send more often.
    remainingThisRun: remaining,
    batchFull: due.length === BATCH_LIMIT,
  })
}

/** Niche wording wins where it exists; the default ladder fills the rest. */
function resolveCopy(
  nicheSlug: string | null,
  ruleKey: string,
  tone: 'friendly' | 'firm',
  vars: {
    clientName: string
    businessName: string
    invoiceNumber: string
    amount: string
    dueDate: string
    daysOverdue: number
  },
) {
  const base = defaultReminderCopy(ruleKey, tone, vars)
  const override = getNiche(nicheSlug)?.reminderCopy?.[ruleKey]?.[tone]
  if (!override) return base

  return {
    subject: override.subject ? interpolate(override.subject, vars) : base.subject,
    body: override.body ? interpolate(override.body, vars) : base.body,
  }
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  )
}
