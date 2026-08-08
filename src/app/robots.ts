import type { MetadataRoute } from 'next'
import { appUrl } from '@/lib/email'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Client invoices, the app itself, and API routes must never be indexed.
      disallow: ['/i/', '/api/', '/invoices', '/settings', '/billing', '/login'],
    },
    sitemap: `${appUrl()}/sitemap.xml`,
  }
}
