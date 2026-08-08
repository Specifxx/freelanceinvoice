import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { documents } from '@/db/schema'
import { recordEvent, type EventType } from '@/lib/events'

export const runtime = 'nodejs'

/**
 * Delivery signals from Resend. Bounces and complaints matter most: a
 * freelancer needs to know an invoice never arrived, and we need to see
 * reputation problems before they sink deliverability for everyone.
 *
 * `email.opened` is recorded but treated as weak evidence — Apple Mail Privacy
 * Protection prefetches images and Gmail proxies them, so opens over-report
 * badly. The UI presents invoice *page views* as the real signal.
 */
const TYPE_MAP: Record<string, EventType> = {
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.opened': 'email_opened',
}

export async function POST(request: Request) {
  let payload: { type?: string; data?: { to?: string[] | string; email_id?: string } }
  try {
    payload = await request.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const eventType = payload.type ? TYPE_MAP[payload.type] : undefined
  if (!eventType) return Response.json({ received: true, ignored: true })

  const to = Array.isArray(payload.data?.to) ? payload.data?.to[0] : payload.data?.to
  if (!to) return Response.json({ received: true, ignored: true })

  // Resend reports the recipient, not our document id, so we attribute to that
  // recipient's most recent sent invoice.
  const [doc] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.clientEmail, to.toLowerCase()), eq(documents.kind, 'invoice')))
    .orderBy(desc(documents.sentAt))
    .limit(1)

  if (!doc) return Response.json({ received: true, unmatched: true })

  await recordEvent({
    documentId: doc.id,
    type: eventType,
    meta: { provider: 'resend', emailId: payload.data?.email_id ?? null },
  })

  return Response.json({ received: true })
}
