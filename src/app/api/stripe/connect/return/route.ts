import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { stripeConnections } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { fetchAccountStatus } from '@/lib/stripe'

export const runtime = 'nodejs'

/**
 * Where Stripe returns the user after hosted onboarding. Returning here does
 * NOT mean onboarding succeeded — Stripe is explicit that the return URL can
 * fire on an incomplete flow — so we re-read the account state rather than
 * assuming. The account.updated webhook keeps it fresh afterwards.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [connection] = await db
    .select()
    .from(stripeConnections)
    .where(eq(stripeConnections.userId, user.id))
    .limit(1)

  if (!connection) redirect('/settings?stripe=missing')

  try {
    const status = await fetchAccountStatus(connection.stripeAccountId)
    await db
      .update(stripeConnections)
      .set({
        chargesEnabled: status.chargesEnabled,
        payoutsEnabled: status.payoutsEnabled,
        detailsSubmitted: status.detailsSubmitted,
        onboardedAt: status.chargesEnabled ? new Date() : null,
        lastSyncedAt: new Date(),
      })
      .where(eq(stripeConnections.userId, user.id))

    redirect(`/settings?stripe=${status.chargesEnabled ? 'connected' : 'incomplete'}`)
  } catch (error) {
    // redirect() throws a control-flow signal — never swallow it as an error.
    if (error instanceof Error && error.message.includes('NEXT_REDIRECT')) throw error
    console.error('[stripe] status sync failed', error)
    redirect('/settings?stripe=error')
  }
}
