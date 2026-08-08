import Link from 'next/link'
import { ButtonLink } from './ui'
import { NICHES } from '@/niches'
import { PRICING } from '@/lib/entitlements'

export function SiteHeader({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <header className="border-b border-slate-200">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-sm font-bold tracking-tight text-slate-900">
          FreelanceInvoice
        </Link>
        <nav className="flex items-center gap-2">
          <Link
            href="/free-invoice-generator"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 sm:block"
          >
            Free generator
          </Link>
          {signedIn ? (
            <ButtonLink href="/invoices" size="sm">
              My invoices
            </ButtonLink>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Sign in
              </Link>
              <ButtonLink href="/free-invoice-generator" size="sm">
                Create an invoice
              </ButtonLink>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <p className="text-sm font-bold text-slate-900">FreelanceInvoice</p>
            <p className="mt-2 max-w-xs text-sm text-slate-600">
              Branded invoices with a payment link and automatic reminders, so you
              stop chasing and get paid.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Templates
            </p>
            <ul className="mt-3 space-y-2">
              {NICHES.map((niche) => (
                <li key={niche.slug}>
                  <Link
                    href={`/${niche.slug}-invoice-template`}
                    className="text-sm text-slate-600 hover:text-slate-900"
                  >
                    {niche.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Product
            </p>
            <ul className="mt-3 space-y-2">
              <li>
                <Link
                  href="/free-invoice-generator"
                  className="text-sm text-slate-600 hover:text-slate-900"
                >
                  Free invoice generator
                </Link>
              </li>
              <li>
                <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900">
                  Sign in
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <p className="mt-10 text-xs text-slate-500">
          Card payments are processed by Stripe. We never see or store card details.
        </p>
      </div>
    </footer>
  )
}

const FEATURES = [
  {
    title: 'Reminders that escalate',
    body: 'Three days before the due date, on the day, then at 3, 7 and 14 days overdue — each one worded a little more firmly. They stop the instant the invoice is paid.',
  },
  {
    title: 'One-tap payment',
    body: 'Every invoice carries a Pay button. The money goes straight to your Stripe account, and the invoice marks itself paid.',
  },
  {
    title: 'You see when it lands',
    body: 'Know the moment a client opens the invoice, so a "never got it" is answerable with a date and time.',
  },
]

export function FeatureGrid() {
  return (
    <div className="grid gap-6 sm:grid-cols-3">
      {FEATURES.map((feature) => (
        <div key={feature.title} className="rounded-xl bg-white p-6 ring-1 ring-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">{feature.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{feature.body}</p>
        </div>
      ))}
    </div>
  )
}

export function PricingBlock() {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="rounded-xl bg-white p-6 ring-1 ring-slate-200">
        <h3 className="text-sm font-semibold text-slate-900">Free</h3>
        <p className="mt-1 text-3xl font-bold text-slate-900">$0</p>
        <ul className="mt-4 space-y-2 text-sm text-slate-600">
          <li>3 sent invoices a month</li>
          <li>Unlimited drafts and PDF downloads</li>
          <li>Payment link and paid tracking</li>
          <li>
            <strong className="text-slate-900">Automatic reminders included</strong>
          </li>
          <li>Small FreelanceInvoice credit on the invoice</li>
        </ul>
      </div>
      <div className="rounded-xl bg-slate-900 p-6 text-white">
        <h3 className="text-sm font-semibold">Pro</h3>
        <p className="mt-1 text-3xl font-bold">
          ${PRICING.monthly}
          <span className="text-base font-normal text-slate-300">/mo</span>
        </p>
        <p className="text-xs text-slate-400">or ${PRICING.annual}/year</p>
        <ul className="mt-4 space-y-2 text-sm text-slate-200">
          <li>Unlimited invoices</li>
          <li>Your branding only — ours removed</li>
          <li>Custom reminder schedules and tone</li>
          <li>Recurring and retainer invoices</li>
          <li>Client management and export</li>
        </ul>
      </div>
    </div>
  )
}
