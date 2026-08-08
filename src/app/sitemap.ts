import type { MetadataRoute } from 'next'
import { appUrl } from '@/lib/email'
import { NICHES } from '@/niches'

/** Only public, indexable pages. Invoices at /i/* are noindex by design. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = appUrl()
  const now = new Date()

  return [
    { url: base, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    {
      url: `${base}/free-invoice-generator`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    ...NICHES.map((niche) => ({
      url: `${base}/${niche.slug}-invoice-template`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ]
}
