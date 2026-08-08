import type { Metadata } from 'next'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { stripeConnections } from '@/db/schema'
import { saveSettingsAction } from '../actions'
import { Alert, Button, Card, Field, Input, Select, Textarea } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { bpsToPercent } from '@/lib/totals'
import { isStripeConfigured } from '@/lib/stripe'
import { NICHES } from '@/niches'
import { THEME_LIST } from '@/themes'

export const metadata: Metadata = { title: 'Settings', robots: { index: false } }

const STRIPE_MESSAGES: Record<string, { tone: 'success' | 'warning' | 'error'; text: string }> = {
  connected: { tone: 'success', text: 'Stripe is connected. Clients can now pay by card.' },
  incomplete: {
    tone: 'warning',
    text: 'Stripe onboarding is not finished yet. Pick up where you left off below.',
  },
  refresh: { tone: 'warning', text: 'That onboarding link expired. Start again below.' },
  missing: { tone: 'error', text: 'No Stripe connection found. Start onboarding below.' },
  error: { tone: 'error', text: 'Could not read your Stripe status. Try again shortly.' },
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; stripe?: string }>
}) {
  const { saved, stripe } = await searchParams
  const user = await requireUser()

  const [connection] = await db
    .select()
    .from(stripeConnections)
    .where(eq(stripeConnections.userId, user.id))
    .limit(1)

  const stripeMessage = stripe ? STRIPE_MESSAGES[stripe] : undefined

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>

      {saved ? <Alert tone="success">Settings saved.</Alert> : null}
      {stripeMessage ? <Alert tone={stripeMessage.tone}>{stripeMessage.text}</Alert> : null}

      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Getting paid</h2>
        <p className="mt-2 text-sm text-slate-600">
          Connect Stripe to put a Pay button on every invoice. Money goes straight
          to your own Stripe account — it never passes through us, and we never see
          card details.
        </p>

        {!isStripeConfigured() ? (
          <div className="mt-4">
            <Alert tone="warning">
              Stripe isn&rsquo;t configured on this deployment yet. Add
              STRIPE_SECRET_KEY to enable card payments.
            </Alert>
          </div>
        ) : connection?.chargesEnabled ? (
          <p className="mt-4 text-sm font-medium text-emerald-700">
            Connected and ready to accept payments.
          </p>
        ) : (
          <form action="/api/stripe/connect" method="post" className="mt-4">
            <Button type="submit">
              {connection ? 'Finish Stripe setup' : 'Connect Stripe'}
            </Button>
          </form>
        )}

        <div className="mt-6 border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-500">
            No Stripe yet? Add your bank details below and they print on every
            invoice, with a &ldquo;Mark as paid&rdquo; button for you.
          </p>
        </div>
      </Card>

      <form action={saveSettingsAction} className="space-y-6">
        <Card className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Your business</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name">
              <Input name="businessName" defaultValue={user.businessName ?? ''} />
            </Field>
            <Field label="Your name">
              <Input name="name" defaultValue={user.name ?? ''} />
            </Field>
            <Field label="Business email" hint="Where client replies go.">
              <Input
                name="businessEmail"
                type="email"
                defaultValue={user.businessEmail ?? user.email}
              />
            </Field>
            <Field label="Phone">
              <Input name="businessPhone" defaultValue={user.businessPhone ?? ''} />
            </Field>
          </div>
          <Field label="Address">
            <Textarea name="businessAddress" rows={3} defaultValue={user.businessAddress ?? ''} />
          </Field>
          <Field
            label="Bank / payment details"
            hint="Prints on the invoice. Useful before Stripe is connected, or for clients who pay by transfer."
          >
            <Textarea name="bankDetails" rows={3} defaultValue={user.bankDetails ?? ''} />
          </Field>
        </Card>

        <Card className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Invoice defaults</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Currency">
              <Input name="defaultCurrency" defaultValue={user.defaultCurrency} maxLength={3} />
            </Field>
            <Field label="Payment terms (days)">
              <Input
                name="defaultPaymentTermsDays"
                type="number"
                min={0}
                max={365}
                defaultValue={user.defaultPaymentTermsDays}
              />
            </Field>
            <Field label="Invoice number format">
              <Input name="invoiceNumberFormat" defaultValue={user.invoiceNumberFormat} />
            </Field>
            <Field label="Tax label">
              <Input name="taxLabel" defaultValue={user.taxLabel} />
            </Field>
            <Field label="Default tax %">
              <Input
                name="defaultTaxPercent"
                inputMode="decimal"
                defaultValue={String(bpsToPercent(user.defaultTaxRateBps))}
              />
            </Field>
            <Field label="Your line of work" hint="Sets default line items and wording.">
              <Select name="nicheSlug" defaultValue={user.nicheSlug ?? ''}>
                <option value="">General</option>
                {NICHES.map((niche) => (
                  <option key={niche.slug} value={niche.slug}>
                    {niche.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Theme">
              <Select name="themeId" defaultValue={user.themeId}>
                {THEME_LIST.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Accent colour">
              <Input name="accentColor" defaultValue={user.accentColor} />
            </Field>
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Chasing payment</h2>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="remindersEnabledByDefault"
              defaultChecked={user.remindersEnabledByDefault}
              className="mt-0.5 h-4 w-4 rounded border-slate-300"
            />
            <span className="text-sm">
              <span className="font-medium text-slate-900">
                Chase new invoices automatically
              </span>
              <span className="mt-0.5 block text-xs text-slate-600">
                3 days before due, on the due date, then 3, 7 and 14 days overdue.
                Always switchable per invoice.
              </span>
            </span>
          </label>
          <Field label="Default tone">
            <Select name="reminderTone" defaultValue={user.reminderTone} className="max-w-xs">
              <option value="friendly">Friendly</option>
              <option value="firm">Firm</option>
            </Select>
          </Field>
        </Card>

        <Button type="submit">Save settings</Button>
      </form>
    </div>
  )
}
