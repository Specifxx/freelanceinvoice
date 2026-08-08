import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { stripeConnections } from '@/db/schema'
import { jsonError } from '@/lib/document-access'
import { appUrl } from '@/lib/email'
import { clientIpFrom, recordEvent } from '@/lib/events'
import { getDocumentByToken } from '@/lib/invoices'
import { createInvoiceCheckoutSession, isStripeConfigured } from '@/lib/stripe'

export const runtime = 'nodejs'

/**
 * Creates a Stripe Checkout session for a public invoice. The charge is
 * created ON THE CONNECTED ACCOUNT, so the money lands in the freelancer's
 * balance and never passes through ours.
 *
 * Unauthenticated by design — the client paying has no account here. The
 * 128-bit token in the URL is the capability.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params

  if (!isStripeConfigured()) return jsonError('Card payment is not available.', 503)

  const doc = await getDocumentByToken(token)
  if (!doc || !doc.ownerId) return jsonError('Not found', 404)
  if (!doc.sentAt) return jsonError('This invoice is not ready for payment.', 409)
  if (doc.paidAt) return jsonError('This invoice is already paid.', 409)
  if (doc.totalCents <= 0) return jsonError('This invoice has nothing to pay.', 400)

  const [connection] = await db
    .select()
    .from(stripeConnections)
    .where(eq(stripeConnections.userId, doc.ownerId))
    .limit(1)

  if (!connection?.chargesEnabled) {
    return jsonError(
      'This business has not finished setting up card payments. Use the payment details on the invoice.',
      503,
    )
  }

  try {
    const url = await createInvoiceCheckoutSession({
      connectedAccountId: connection.stripeAccountId,
      documentId: doc.id,
      invoiceNumber: doc.number ?? 'Invoice',
      amountCents: doc.totalCents,
      currency: doc.currency,
      clientEmail: doc.clientEmail,
      successUrl: `${appUrl()}/i/${token}?paid=1`,
      cancelUrl: `${appUrl()}/i/${token}`,
    })

    await recordEvent({
      documentId: doc.id,
      type: 'payment_started',
      ip: clientIpFrom(request.headers),
      userAgent: request.headers.get('user-agent'),
    })

    return Response.json({ url })
  } catch (error) {
    console.error('[pay] checkout creation failed', error)
    return jsonError('Could not start checkout. Please try again.', 502)
  }
}
