import type { Metadata } from 'next'
import { InvoiceBuilder } from '@/components/InvoiceBuilder'
import { SiteFooter, SiteHeader } from '@/components/marketing'
import { getCurrentUser } from '@/lib/auth'
import { defaultBuilderState } from '@/lib/builder-defaults'
import { getNiche, presetsFor } from '@/niches'

export const metadata: Metadata = {
  title: 'Free Invoice Generator — No Signup, PDF in Under a Minute',
  description:
    'Create and download a professional invoice free, with no signup. Add your logo colours, line items and tax, then download the PDF or send it with a payment link and automatic reminders.',
  alternates: { canonical: '/free-invoice-generator' },
}

/**
 * The top-of-funnel wedge: a genuinely useful free tool that ranks, with the
 * account gate placed at *send* rather than at *create*. See PLAN.md §2a.
 */
export default async function FreeGeneratorPage({
  searchParams,
}: {
  searchParams: Promise<{ niche?: string }>
}) {
  const { niche: requestedNiche } = await searchParams
  const niche = getNiche(requestedNiche)
  const user = await getCurrentUser().catch(() => null)

  return (
    <>
      <SiteHeader signedIn={Boolean(user)} />

      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {niche ? `${niche.seo.h1}` : 'Free invoice generator'}
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Fill it in and download the PDF — no account, no email required. When
            you want it sent, tracked and paid by card, we&rsquo;ll take it from
            there.
          </p>
        </div>

        <InvoiceBuilder
          documentId={null}
          initial={defaultBuilderState({ nicheSlug: niche?.slug, user })}
          presets={presetsFor(niche?.slug)}
          mode={user ? 'owner' : 'anonymous'}
          showsOurBranding={user?.plan !== 'pro'}
          nicheSlug={niche?.slug ?? null}
        />
      </main>

      <SiteFooter />
    </>
  )
}
