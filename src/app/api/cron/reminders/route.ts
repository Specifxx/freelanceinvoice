import { and, eq, isNull, lte } from 'drizzle-orm'
import { db } from '@/db'
import { documents, reminders, users } from '@/db/schema'
import { purgeExpiredAuthRows } from '@/lib/auth'
import { daysBetweenIso, formatDateHuman, todayIso } from '@/lib/dates'
import { appUrl, renderEmailHtml, sendEmail } from '@/lib/email'
import { recordEvent } from '@/lib/events'
import { formatMoney } from '@/lib/money'
import { defaultReminderCopy, isReminderTone } from '@/lib/reminders'
import { getNiche } from '@/niches'
import { safeEqual } from '@/lib/tokens'

export const runtime = 'nodejs'
// Reminder batches can outrun the default serverless timeout.
export const maxDuration = 60

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
    .limit(200)

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const row of due) {
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

  await purgeExpiredAuthRows()

  return Response.json({
    ok: true,
    considered: due.length,
    sent,
    skipped,
    failed,
    // Surfaced deliberately: a silently truncated batch would look like a
    // quiet day rather than a backlog.
    truncated: due.length === 200,
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
