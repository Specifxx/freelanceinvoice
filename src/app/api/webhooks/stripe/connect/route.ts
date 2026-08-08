import { eq } from 'drizzle-orm'
import type Stripe from 'stripe'
import { db } from '@/db'
import { payments, stripeConnections } from '@/db/schema'
import { appUrl, renderEmailHtml, sendEmail } from '@/lib/email'
import { recordEvent } from '@/lib/events'
import { getOwnedDocumentById, markDocumentPaid } from '@/lib/invoices'
import { formatMoney } from '@/lib/money'
import { requireStripe } from '@/lib/stripe'
import {
  claimWebhookEvent,
  markWebhookProcessed,
  releaseWebhookEvent,
} from '@/lib/webhook-idempotency'

export const runtime = 'nodejs'

/**
 * Events from CONNECTED accounts — the freelancer's customers paying them.
 * Separate endpoint and separate signing secret from our own billing webhook;
 * create it in Stripe with "Listen to events on Connected accounts" ticked.
 *
 * This, not the browser redirect, is the source of truth for payment: clients
 * close tabs, and the redirect is trivially forgeable.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET
  if (!secret) return new Response('Connect webhook not configured', { status: 503 })

  const signature = request.headers.get('stripe-signature')
  if (!signature) return new Response('Missing signature', { status: 400 })

  // The raw body is required — any JSON parse first breaks the signature.
  const raw = await request.text()

  let event: Stripe.Event
  try {
    event = requireStripe().webhooks.constructEvent(raw, signature, secret)
  } catch (error) {
    console.error('[webhook:connect] signature verification failed', error)
    return new Response('Invalid signature', { status: 400 })
  }

  if (!(await claimWebhookEvent('stripe_connect', event.id, event.type))) {
    return Response.json({ received: true, duplicate: true })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object)
        break
      case 'account.updated':
        await handleAccountUpdated(event.data.object)
        break
      case 'charge.refunded':
        await handleRefund(event.data.object)
        break
      default:
        break
    }
    await markWebhookProcessed(event.id)
  } catch (error) {
    console.error('[webhook:connect] handler failed', event.type, error)
    // 500 asks Stripe to retry. The claim row is already inserted, so a retry
    // would be skipped as a duplicate — release it so the retry does real work.
    await releaseWebhookEvent(event.id)
    return new Response('Handler error', { status: 500 })
  }

  return Response.json({ received: true })
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const documentId = session.metadata?.document_id
  if (!documentId) {
    console.warn('[webhook:connect] checkout session without document_id', session.id)
    return
  }
  if (session.payment_status !== 'paid') return

  const amountCents = session.amount_total ?? 0
  const currency = (session.currency ?? 'usd').toUpperCase()

  await db
    .insert(payments)
    .values({
      documentId,
      provider: 'stripe',
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId:
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : (session.payment_intent?.id ?? null),
      amountCents,
      currency,
      status: 'succeeded',
      method: 'card',
    })
    // Unique on the checkout session id — a redelivery cannot double-record.
    .onConflictDoNothing({ target: payments.stripeCheckoutSessionId })

  const newlyPaid = await markDocumentPaid({ documentId, amountCents })
  if (!newlyPaid) return

  await recordEvent({
    documentId,
    type: 'paid',
    meta: { amountCents, currency, sessionId: session.id },
  })

  await notifyOwnerOfPayment(documentId, amountCents, currency)
}

async function notifyOwnerOfPayment(
  documentId: string,
  amountCents: number,
  currency: string,
) {
  const found = await getOwnedDocumentById(documentId)
  if (!found?.owner) return

  const amount = formatMoney(amountCents, currency)
  const number = found.doc.number ?? 'your invoice'

  await sendEmail({
    to: found.owner.email,
    subject: `Paid: ${number} — ${amount}`,
    text: `${found.doc.clientName ?? 'Your client'} just paid ${number} (${amount}).\n\nReminders for this invoice have been cancelled automatically.\n\n${appUrl()}/invoices/${documentId}`,
    html: renderEmailHtml({
      bodyText: `${found.doc.clientName ?? 'Your client'} just paid ${number} (${amount}).\n\nReminders for this invoice have been cancelled automatically.`,
      ctaLabel: 'View invoice',
      ctaUrl: `${appUrl()}/invoices/${documentId}`,
    }),
  })
}

async function handleAccountUpdated(account: Stripe.Account) {
  await db
    .update(stripeConnections)
    .set({
      chargesEnabled: Boolean(account.charges_enabled),
      payoutsEnabled: Boolean(account.payouts_enabled),
      detailsSubmitted: Boolean(account.details_submitted),
      lastSyncedAt: new Date(),
    })
    .where(eq(stripeConnections.stripeAccountId, account.id))
}

async function handleRefund(charge: Stripe.Charge) {
  const documentId = charge.metadata?.document_id
  if (!documentId) return
  await recordEvent({
    documentId,
    type: 'voided',
    meta: { reason: 'refunded', chargeId: charge.id, amount: charge.amount_refunded },
  })
}
