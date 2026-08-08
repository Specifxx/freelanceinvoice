import { createHmac } from 'node:crypto'
import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { db } from '@/db'
import { documents } from '@/db/schema'
import { recordEvent, type EventType } from '@/lib/events'
import { safeEqual } from '@/lib/tokens'

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

/** Identical for every outcome — see the note at the call sites. */
const OK = () => Response.json({ received: true })

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    console.error('[webhook:resend] RESEND_WEBHOOK_SECRET is not set; rejecting')
    return new Response('Webhook not configured', { status: 503 })
  }

  // Raw body — parsing to JSON first would break the signature.
  const raw = await request.text()
  if (!verifySvixSignature(request.headers, raw, secret)) {
    return new Response('Invalid signature', { status: 400 })
  }

  let payload: { type?: string; data?: { to?: string[] | string; email_id?: string } }
  try {
    payload = JSON.parse(raw)
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const eventType = payload.type ? TYPE_MAP[payload.type] : undefined
  if (!eventType) return OK()

  const to = Array.isArray(payload.data?.to) ? payload.data?.to[0] : payload.data?.to
  if (!to) return OK()

  // Resend reports the recipient, not our document id, so we attribute to that
  // recipient's most recently SENT invoice. isNotNull matters: sent_at is
  // nullable and Postgres sorts NULLS FIRST on DESC, so without it a delivery
  // receipt would attach to an unsent draft instead of the invoice that was
  // actually mailed.
  const [doc] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.clientEmail, to.toLowerCase()),
        eq(documents.kind, 'invoice'),
        isNotNull(documents.sentAt),
      ),
    )
    .orderBy(desc(documents.sentAt))
    .limit(1)

  // Same response whether or not we matched. A distinguishable "unmatched"
  // reply would turn this into an oracle for "is this address someone's client?"
  if (!doc) return OK()

  await recordEvent({
    documentId: doc.id,
    type: eventType,
    meta: { provider: 'resend', emailId: payload.data?.email_id ?? null },
  })

  return OK()
}

/**
 * Resend signs webhooks with Svix: HMAC-SHA256 over `${id}.${timestamp}.${body}`
 * keyed by the base64 material after the `whsec_` prefix. The header can carry
 * several space-separated `v1,<sig>` values during key rotation, so any match
 * counts.
 */
function verifySvixSignature(
  headers: Headers,
  rawBody: string,
  secret: string,
): boolean {
  const id = headers.get('svix-id')
  const timestamp = headers.get('svix-timestamp')
  const signatureHeader = headers.get('svix-signature')
  if (!id || !timestamp || !signatureHeader) return false

  // Reject stale timestamps so a captured delivery cannot be replayed later.
  const sentAt = Number(timestamp)
  if (!Number.isFinite(sentAt)) return false
  if (Math.abs(Date.now() / 1000 - sentAt) > 300) return false

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64')

  return signatureHeader
    .split(' ')
    .map((part) => part.split(',')[1])
    .some((candidate) => Boolean(candidate) && safeEqual(candidate!, expected))
}
