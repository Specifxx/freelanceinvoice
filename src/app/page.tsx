import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { FeatureGrid, PricingBlock, SiteFooter, SiteHeader } from '@/components/marketing'
import { ButtonLink } from '@/components/ui'
import { NICHES } from '@/niches'

export default async function HomePage() {
  // Reading the session opts this page out of static rendering, which is
  // correct — the header differs for signed-in users.
  const user = await getCurrentUser().catch(() => null)

  return (
    <>
      <SiteHeader signedIn={Boolean(user)} />

      <main>
        <section className="mx-auto max-w-6xl px-4 py-20 text-center">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            For freelancers and one-person businesses
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-bold tracking-tight text-balance text-slate-900 sm:text-5xl">
            Stop writing &ldquo;just following up on this&rdquo;
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-pretty text-slate-600">
            Make a branded invoice in under a minute, send it, and let automatic
            reminders do the chasing. Your client pays in one tap and the invoice
            marks itself paid.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <ButtonLink href="/free-invoice-generator" size="lg">
              Create an invoice — free
            </ButtonLink>
            <span className="text-sm text-slate-500">No signup needed</span>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20">
          <FeatureGrid />
        </section>

        <section className="border-y border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              Built for how you actually bill
            </h2>
            <p className="mt-2 max-w-2xl text-slate-600">
              Pick your line, and the invoice arrives with the right wording, units
              and payment terms already filled in.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {NICHES.map((niche) => (
                <Link
                  key={niche.slug}
                  href={`/${niche.slug}-invoice-template`}
                  className="rounded-xl bg-white p-5 ring-1 ring-slate-200 transition-shadow hover:shadow-md"
                >
                  <p className="text-sm font-semibold text-slate-900">{niche.label}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {niche.lineItemPresets.length} ready-made line items
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Pricing</h2>
          <p className="mt-2 max-w-2xl text-slate-600">
            The free plan keeps the reminders. We would rather you feel an invoice
            get paid without chasing it than gate the thing that makes this useful.
          </p>
          <div className="mt-8">
            <PricingBlock />
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  )
}
