import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { subscriptions } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { jsonError } from '@/lib/document-access'
import { appUrl } from '@/lib/email'
import { createBillingPortalSession, isStripeConfigured } from '@/lib/stripe'

export const runtime = 'nodejs'

/**
 * Stripe's hosted portal handles cancel, plan change and payment method —
 * self-serve billing support with no UI of ours to build or maintain.
 */
export async function POST() {
  const user = await getCurrentUser()
  if (!user) return jsonError('Sign in first.', 401)
  if (!isStripeConfigured()) return jsonError('Billing is not configured.', 503)

  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .limit(1)

  if (!subscription?.stripeCustomerId) {
    return jsonError('No billing account yet. Upgrade first.', 400)
  }

  const url = await createBillingPortalSession({
    customerId: subscription.stripeCustomerId,
    returnUrl: `${appUrl()}/billing`,
  })

  redirect(url)
}
