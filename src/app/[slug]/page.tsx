import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FeatureGrid, SiteFooter, SiteHeader } from '@/components/marketing'
import { ButtonLink } from '@/components/ui'
import { getNiche, NICHES } from '@/niches'

const SUFFIX = '-invoice-template'

/**
 * Every niche landing page in the product, generated from the registry. Adding
 * a profession means adding one file under src/niches — no new route, no
 * schema change, no code branching. See PLAN.md §3.
 */
export function generateStaticParams() {
  return NICHES.map((niche) => ({ slug: `${niche.slug}${SUFFIX}` }))
}

// Anything not generated above 404s instead of hitting the database.
export const dynamicParams = false

function nicheFromSlug(slug: string) {
  if (!slug.endsWith(SUFFIX)) return undefined
  return getNiche(slug.slice(0, -SUFFIX.length))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const niche = nicheFromSlug(slug)
  if (!niche) return {}

  return {
    title: niche.seo.title,
    description: niche.seo.metaDescription,
    alternates: { canonical: `/${slug}` },
    openGraph: {
      title: niche.seo.title,
      description: niche.seo.metaDescription,
      type: 'website',
    },
  }
}

export default async function NicheLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const niche = nicheFromSlug(slug)
  if (!niche) notFound()

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: niche.seo.faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }

  return (
    <>
      <SiteHeader />

      <main>
        <section className="mx-auto max-w-6xl px-4 py-16">
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-balance text-slate-900">
            {niche.seo.h1}
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-pretty text-slate-600">
            {niche.seo.intro}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href={`/free-invoice-generator?niche=${niche.slug}`} size="lg">
              Make a {niche.label.toLowerCase()} invoice
            </ButtonLink>
            <span className="text-sm text-slate-500">
              Free, no signup, PDF in under a minute
            </span>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-6xl px-4 py-14">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Line items already set up for {niche.name}
            </h2>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {niche.lineItemPresets.map((preset) => (
                <li
                  key={preset.description}
                  className="flex items-baseline justify-between gap-4 rounded-lg bg-white px-4 py-3 ring-1 ring-slate-200"
                >
                  <span className="text-sm text-slate-900">{preset.description}</span>
                  <span className="shrink-0 text-xs text-slate-500">
                    per {preset.unit}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-slate-600">
              Default payment terms of {niche.defaults.paymentTermsDays} days, a{' '}
              {niche.defaults.taxLabel.toLowerCase()} field, and terms wording suited
              to {niche.name} — all editable.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Then it chases the payment for you
          </h2>
          <div className="mt-8">
            <FeatureGrid />
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-20">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Questions
          </h2>
          <dl className="mt-8 space-y-8">
            {niche.seo.faq.map((item) => (
              <div key={item.q}>
                <dt className="font-semibold text-slate-900">{item.q}</dt>
                <dd className="mt-2 leading-relaxed text-slate-600">{item.a}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-12 rounded-xl bg-slate-900 p-8 text-center">
            <p className="text-lg font-semibold text-white">
              Make your {niche.label.toLowerCase()} invoice now
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-300">
              Free to download. Add a payment link and automatic reminders when
              you&rsquo;re ready to send.
            </p>
            <div className="mt-6">
              <ButtonLink
                href={`/free-invoice-generator?niche=${niche.slug}`}
                variant="secondary"
                size="lg"
              >
                Start now
              </ButtonLink>
            </div>
          </div>

          <p className="mt-10 text-sm text-slate-500">
            Also for{' '}
            {NICHES.filter((n) => n.slug !== niche.slug).map((other, index, all) => (
              <span key={other.slug}>
                <Link
                  href={`/${other.slug}${SUFFIX}`}
                  className="underline hover:text-slate-900"
                >
                  {other.label.toLowerCase()}
                </Link>
                {index < all.length - 1 ? ', ' : ''}
              </span>
            ))}
            .
          </p>
        </section>
      </main>

      <SiteFooter />

      <script
        type="application/ld+json"
        // Built from our own registry data, not user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </>
  )
}
