import { z } from 'zod'
import { getAnonymousSessionId } from '@/lib/anon'
import { createLoginToken, isValidEmail, normalizeEmail } from '@/lib/auth'
import { jsonError } from '@/lib/document-access'
import { appUrl, renderEmailHtml, sendEmail } from '@/lib/email'
import { clientIpFrom } from '@/lib/events'
import { LIMITS } from '@/lib/rate-limit'
import { sharedRateLimit } from '@/lib/rate-limit-shared'

export const runtime = 'nodejs'

const BodySchema = z.object({
  email: z.string().max(320),
  claimDraftId: z.string().uuid().optional(),
})

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid JSON', 400)
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return jsonError('Enter a valid email address.', 400)

  const email = normalizeEmail(parsed.data.email)
  if (!isValidEmail(email)) return jsonError('Enter a valid email address.', 400)

  /**
   * Postgres-backed rather than in-memory: this endpoint emits mail to an
   * arbitrary address from the one verified domain every invoice depends on,
   * so a per-lambda counter that an attacker can fan out across is not a limit.
   *
   * Per-IP as well as per-email — a per-email cap alone does nothing against
   * an attacker cycling through addresses.
   */
  const ip = clientIpFrom(request.headers) ?? 'unknown'
  const [byEmail, byIp] = await Promise.all([
    sharedRateLimit(`magic:email:${email}`, LIMITS.magicLink.limit, LIMITS.magicLink.windowMs),
    sharedRateLimit(`magic:ip:${ip}`, LIMITS.magicLinkPerIp.limit, LIMITS.magicLinkPerIp.windowMs),
  ])
  if (!byEmail.allowed || !byIp.allowed) {
    return jsonError('Too many sign-in links requested. Try again in a few minutes.', 429)
  }

  // Captured HERE, from the requester, so the draft claim still works when the
  // link is opened on a phone that has never seen this cookie.
  const anonymousSessionId = await getAnonymousSessionId()

  const token = await createLoginToken({
    email,
    claimDraftId: parsed.data.claimDraftId ?? null,
    anonymousSessionId,
  })
  const url = `${appUrl()}/api/auth/callback?token=${encodeURIComponent(token)}`

  await sendEmail({
    to: email,
    subject: 'Your FreelanceInvoice sign-in link',
    text: `Click to sign in:\n\n${url}\n\nYou'll be asked to confirm with one tap. This link works once and expires in 15 minutes. If you didn't request it, you can ignore this email.`,
    html: renderEmailHtml({
      bodyText:
        "Click the button below to sign in to FreelanceInvoice. You'll be asked to confirm with one tap.\n\nThis link works once and expires in 15 minutes.",
      ctaLabel: 'Sign in',
      ctaUrl: url,
      footerNote: "If you didn't request this, you can safely ignore it.",
    }),
  })

  // Always the same response, whether or not the address has an account —
  // otherwise this endpoint tells an attacker who is registered.
  return Response.json({ ok: true })
}
