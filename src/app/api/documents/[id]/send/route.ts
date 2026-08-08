import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { formatDateHuman } from '@/lib/dates'
import { jsonError } from '@/lib/document-access'
import { appUrl, renderEmailHtml, sendEmail } from '@/lib/email'
import { clientIpFrom, recordEvent } from '@/lib/events'
import { checkCanSend } from '@/lib/entitlements'
import {
  assignInvoiceNumber,
  buildSnapshot,
  countSentThisPeriod,
  getOwnedDocument,
  markDocumentSent,
  scheduleRemindersFor,
} from '@/lib/invoices'
import { formatMoney } from '@/lib/money'
import { LIMITS, rateLimit } from '@/lib/rate-limit'
import { todayIso } from '@/lib/dates'
import { pdfFilename, renderInvoicePdf } from '@/pdf/InvoicePdf'

export const runtime = 'nodejs'

const BodySchema = z.object({ message: z.string().max(4000).optional() })

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params

  // Anonymous visitors can build and download but never send. This is both the
  // conversion gate and what stops the free tool being a spam relay.
  const user = await getCurrentUser()
  if (!user) return jsonError('Sign in to send invoices.', 401)

  const limit = rateLimit(`send:${user.id}`, LIMITS.send.limit, LIMITS.send.windowMs)
  if (!limit.allowed) return jsonError('Too many invoices sent in the last hour.', 429)

  const doc = await getOwnedDocument(id, user.id)
  if (!doc) return jsonError('Not found', 404)
  if (doc.sentAt) return jsonError('This invoice has already been sent.', 409)
  if (!doc.clientEmail) return jsonError('Add a client email address first.', 400)
  if (doc.items.length === 0) return jsonError('Add at least one line item.', 400)

  // The freemium gate lives here, on the server, counted on SEND.
  const sentThisPeriod = await countSentThisPeriod(user.id)
  const check = checkCanSend(user.plan, sentThisPeriod)
  if (!check.allowed) {
    return Response.json(
      { error: check.reason, upgradeRequired: true, used: check.used, limit: check.limit },
      { status: 402 },
    )
  }

  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    // An empty body is fine — the message is optional.
  }
  const parsed = BodySchema.safeParse(body)
  const message = parsed.success ? parsed.data.message : undefined

  const issuedOn = todayIso()
  const number = await assignInvoiceNumber(user.id, doc.issueDate)
  const snapshot = buildSnapshot(doc, user, number)

  // Freeze BEFORE sending. If the email fails we still have an accurate record
  // of what was generated, and a retry cannot produce a different document.
  await markDocumentSent({ documentId: doc.id, number, snapshot })

  const invoiceUrl = `${appUrl()}/i/${doc.publicToken}`
  const total = formatMoney(doc.totalCents, doc.currency)
  const businessName = snapshot.business.name
  const bodyText =
    (message?.trim() ||
      `Hi ${doc.clientName || 'there'},\n\nPlease find invoice ${number} below.`) +
    `\n\nInvoice ${number} — ${total}\nDue ${formatDateHuman(doc.dueDate)}`

  let pdf: Buffer | null = null
  try {
    pdf = await renderInvoicePdf(snapshot)
  } catch (error) {
    // A failed PDF must not block the invoice — the link still works.
    console.error('[send] PDF render failed', error)
  }

  const result = await sendEmail({
    to: doc.clientEmail,
    subject: `Invoice ${number} from ${businessName} — ${total}`,
    fromName: businessName,
    replyTo: user.businessEmail || user.email,
    text: `${bodyText}\n\nView and pay: ${invoiceUrl}`,
    html: renderEmailHtml({
      bodyText,
      ctaLabel: 'View and pay invoice',
      ctaUrl: invoiceUrl,
      accentColor: doc.accentColor,
      footerNote: `Sent by ${businessName} via FreelanceInvoice.`,
    }),
    ...(pdf ? { attachments: [{ filename: pdfFilename(snapshot), content: pdf }] } : {}),
  })

  await recordEvent({
    documentId: doc.id,
    type: 'sent',
    ip: clientIpFrom(request.headers),
    userAgent: request.headers.get('user-agent'),
    meta: {
      to: doc.clientEmail,
      number,
      emailId: result.ok ? result.id : null,
      emailError: result.ok ? null : result.error,
    },
  })

  // Reminders are scheduled even if the email bounced — the client may still
  // be nudged, and the freelancer sees the delivery failure on the timeline.
  const scheduled = await scheduleRemindersFor({ ...doc, dueDate: doc.dueDate }, issuedOn)

  if (!result.ok) {
    return Response.json(
      {
        ok: true,
        warning: `Invoice recorded, but the email failed to send: ${result.error}`,
        remindersScheduled: scheduled,
      },
      { status: 200 },
    )
  }

  return Response.json({ ok: true, number, remindersScheduled: scheduled })
}
