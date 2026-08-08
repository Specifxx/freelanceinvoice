import { eq } from 'drizzle-orm'
import type Stripe from 'stripe'
import { db } from '@/db'
import { subscriptions, users } from '@/db/schema'
import { requireStripe } from '@/lib/stripe'
import {
  claimWebhookEvent,
  markWebhookProcessed,
  releaseWebhookEvent,
} from '@/lib/webhook-idempotency'

export const runtime = 'nodejs'

/**
 * Events from OUR OWN platform account — our subscription revenue. Entirely
 * separate from the Connect endpoint: different events, different signing
 * secret, different money.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) return new Response('Billing webhook not configured', { status: 503 })

  const signature = request.headers.get('stripe-signature')
  if (!signature) return new Response('Missing signature', { status: 400 })

  const raw = await request.text()

  let event: Stripe.Event
  try {
    event = requireStripe().webhooks.constructEvent(raw, signature, secret)
  } catch (error) {
    console.error('[webhook:billing] signature verification failed', error)
    return new Response('Invalid signature', { status: 400 })
  }

  if (!(await claimWebhookEvent('stripe_billing', event.id, event.type))) {
    return Response.json({ received: true, duplicate: true })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        if (session.mode === 'subscription') await syncFromCheckout(session)
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(event.data.object)
        break
      default:
        break
    }
    await markWebhookProcessed(event.id)
  } catch (error) {
    console.error('[webhook:billing] handler failed', event.type, error)
    await releaseWebhookEvent(event.id)
    return new Response('Handler error', { status: 500 })
  }

  return Response.json({ received: true })
}

async function syncFromCheckout(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id ?? session.client_reference_id
  if (!userId) return

  const customerId =
    typeof session.customer === 'string' ? session.customer : session.customer?.id
  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id

  await db
    .insert(subscriptions)
    .values({
      userId,
      stripeCustomerId: customerId ?? null,
      stripeSubscriptionId: subscriptionId ?? null,
      plan: 'pro',
      status: 'active',
    })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        stripeCustomerId: customerId ?? null,
        stripeSubscriptionId: subscriptionId ?? null,
        plan: 'pro',
        status: 'active',
      },
    })

  await db.update(users).set({ plan: 'pro' }).where(eq(users.id, userId))
}

/** Statuses that still entitle the user to paid features. */
const ENTITLING = new Set(['active', 'trialing', 'past_due'])

async function syncSubscription(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.user_id
  if (!userId) {
    console.warn('[webhook:billing] subscription without user_id', subscription.id)
    return
  }

  // past_due keeps access during Stripe's retry window — cutting someone off
  // mid-dunning over a temporarily declined card is a good way to lose them.
  const entitled = ENTITLING.has(subscription.status)
  const plan = entitled ? 'pro' : 'free'

  const item = subscription.items.data[0]

  await db
    .insert(subscriptions)
    .values({
      userId,
      stripeCustomerId:
        typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id,
      stripeSubscriptionId: subscription.id,
      plan,
      status: subscription.status,
      currentPeriodStart: item?.current_period_start
        ? new Date(item.current_period_start * 1000)
        : null,
      currentPeriodEnd: item?.current_period_end
        ? new Date(item.current_period_end * 1000)
        : null,
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        stripeSubscriptionId: subscription.id,
        plan,
        status: subscription.status,
        currentPeriodStart: item?.current_period_start
          ? new Date(item.current_period_start * 1000)
          : null,
        currentPeriodEnd: item?.current_period_end
          ? new Date(item.current_period_end * 1000)
          : null,
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      },
    })

  await db.update(users).set({ plan }).where(eq(users.id, userId))
}
