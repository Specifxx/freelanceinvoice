import type { Metadata } from 'next'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { subscriptions } from '@/db/schema'
import { Alert, Button, Card } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { getEntitlements, PRICING } from '@/lib/entitlements'
import { countSentThisPeriod } from '@/lib/invoices'
import { isStripeConfigured } from '@/lib/stripe'

export const metadata: Metadata = { title: 'Billing', robots: { index: false } }

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string }>
}) {
  const { upgraded } = await searchParams
  const user = await requireUser()
  const entitlements = getEntitlements(user.plan)

  const [sent, subscription] = await Promise.all([
    countSentThisPeriod(user.id),
    db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, user.id))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ])

  const isPro = user.plan === 'pro'

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Billing</h1>

      {upgraded ? (
        <Alert tone="success">
          You&rsquo;re on Pro. Unlimited invoices, and our branding is gone.
        </Alert>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Current plan: {isPro ? 'Pro' : 'Free'}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {entitlements.monthlySendLimit === null
                ? `${sent} invoices sent this month · unlimited`
                : `${sent} of ${entitlements.monthlySendLimit} invoices sent this month`}
            </p>
            {subscription?.cancelAtPeriodEnd && subscription.currentPeriodEnd ? (
              <p className="mt-2 text-sm text-amber-700">
                Cancels on{' '}
                {subscription.currentPeriodEnd.toISOString().slice(0, 10)}.
              </p>
            ) : null}
          </div>

          {isPro && subscription?.stripeCustomerId ? (
            <form action="/api/billing/portal" method="post">
              <Button type="submit" variant="secondary">
                Manage subscription
              </Button>
            </form>
          ) : null}
        </div>
      </Card>

      {!isPro ? (
        <Card>
          <h2 className="text-sm font-semibold text-slate-900">Upgrade to Pro</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>Unlimited invoices</li>
            <li>Your branding only — the FreelanceInvoice credit is removed</li>
            <li>Custom reminder schedules and tone</li>
            <li>Recurring and retainer invoices, client management, export</li>
          </ul>

          {!isStripeConfigured() ? (
            <div className="mt-4">
              <Alert tone="warning">
                Billing isn&rsquo;t configured on this deployment. Set
                STRIPE_SECRET_KEY and the price IDs to enable upgrades.
              </Alert>
            </div>
          ) : (
            <div className="mt-5 flex flex-wrap gap-3">
              <form action="/api/billing/checkout" method="post">
                <input type="hidden" name="interval" value="monthly" />
                <Button type="submit">${PRICING.monthly}/month</Button>
              </form>
              <form action="/api/billing/checkout" method="post">
                <input type="hidden" name="interval" value="annual" />
                <Button type="submit" variant="secondary">
                  ${PRICING.annual}/year
                </Button>
              </form>
            </div>
          )}

          <p className="mt-4 text-xs text-slate-500">
            Automatic reminders stay on the free plan. We charge for volume and
            branding, not for the thing that gets you paid.
          </p>
        </Card>
      ) : null}
    </div>
  )
}
