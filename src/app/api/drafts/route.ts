import { ensureAnonymousSessionId } from '@/lib/anon'
import { getCurrentUser } from '@/lib/auth'
import { jsonError } from '@/lib/document-access'
import { clientIpFrom } from '@/lib/events'
import { createDraft } from '@/lib/invoices'
import { rateLimit } from '@/lib/rate-limit'
import { nicheSlugs } from '@/niches'

export const runtime = 'nodejs'

/**
 * Creates a draft lazily, on the visitor's first keystroke-triggered save
 * rather than on page load. A row per page view would mean a row per bot hit
 * and per link prefetch on the most-crawled page on the site.
 */
export async function POST(request: Request) {
  const ip = clientIpFrom(request.headers) ?? 'unknown'
  const limit = rateLimit(`newdraft:${ip}`, 20, 60_000)
  if (!limit.allowed) return jsonError('Too many drafts created. Try again shortly.', 429)

  const url = new URL(request.url)
  const requestedNiche = url.searchParams.get('niche')
  const nicheSlug = requestedNiche && nicheSlugs().includes(requestedNiche)
    ? requestedNiche
    : null

  const user = await getCurrentUser()

  if (user) {
    const doc = await createDraft({ ownerId: user.id, nicheSlug: nicheSlug ?? user.nicheSlug })
    return Response.json({ id: doc.id })
  }

  const anonymousSessionId = await ensureAnonymousSessionId()
  const doc = await createDraft({ anonymousSessionId, nicheSlug })
  return Response.json({ id: doc.id })
}
