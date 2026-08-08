import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { subscriptions } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { jsonError } from '@/lib/document-access'
import { appUrl } from '@/lib/email'
import { createSubscriptionCheckoutSession, isStripeConfigured } from '@/lib/stripe'

export const runtime = 'nodejs'

/** Our own subscription checkout — platform account, not Connect. */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return jsonError('Sign in first.', 401)
  if (!isStripeConfigured()) return jsonError('Billing is not configured.', 503)

  const form = await request.formData().catch(() => null)
  const interval = form?.get('interval') === 'annual' ? 'annual' : 'monthly'

  const priceId =
    interval === 'annual'
      ? process.env.STRIPE_PRICE_ID_ANNUAL
      : process.env.STRIPE_PRICE_ID_MONTHLY

  if (!priceId) {
    return jsonError(
      `No Stripe price configured for the ${interval} plan. Set STRIPE_PRICE_ID_${interval.toUpperCase()}.`,
      503,
    )
  }

  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .limit(1)

  const url = await createSubscriptionCheckoutSession({
    userId: user.id,
    email: user.email,
    priceId,
    existingCustomerId: existing?.stripeCustomerId ?? null,
    successUrl: `${appUrl()}/billing?upgraded=1`,
    cancelUrl: `${appUrl()}/billing`,
  })

  redirect(url)
}
