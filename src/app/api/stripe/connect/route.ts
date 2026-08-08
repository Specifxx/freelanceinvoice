import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { stripeConnections } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { jsonError } from '@/lib/document-access'
import { appUrl } from '@/lib/email'
import {
  createAccountLink,
  createConnectAccount,
  isStripeConfigured,
} from '@/lib/stripe'

export const runtime = 'nodejs'

/**
 * Starts (or resumes) Stripe Connect onboarding. Stripe collects KYC on their
 * own hosted screens, so no identity data ever reaches us.
 */
export async function POST() {
  const user = await getCurrentUser()
  if (!user) return jsonError('Sign in first.', 401)
  if (!isStripeConfigured()) {
    return jsonError(
      'Stripe is not configured on this deployment. Set STRIPE_SECRET_KEY.',
      503,
    )
  }

  const [existing] = await db
    .select()
    .from(stripeConnections)
    .where(eq(stripeConnections.userId, user.id))
    .limit(1)

  let accountId = existing?.stripeAccountId
  if (!accountId) {
    accountId = await createConnectAccount(user.email)
    await db
      .insert(stripeConnections)
      .values({ userId: user.id, stripeAccountId: accountId })
      .onConflictDoNothing({ target: stripeConnections.userId })
  }

  const url = await createAccountLink({
    accountId,
    // Account links are single-use and short-lived; refresh_url sends the user
    // back here to mint a new one rather than showing them an expired page.
    refreshUrl: `${appUrl()}/settings?stripe=refresh`,
    returnUrl: `${appUrl()}/api/stripe/connect/return`,
  })

  redirect(url)
}
