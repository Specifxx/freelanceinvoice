import { z } from 'zod'
import { createLoginToken, isValidEmail, normalizeEmail } from '@/lib/auth'
import { jsonError } from '@/lib/document-access'
import { appUrl, renderEmailHtml, sendEmail } from '@/lib/email'
import { LIMITS, rateLimit } from '@/lib/rate-limit'

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

  const limit = rateLimit(
    `magic:${email}`,
    LIMITS.magicLink.limit,
    LIMITS.magicLink.windowMs,
  )
  if (!limit.allowed) {
    return jsonError('Too many sign-in links requested. Try again in a few minutes.', 429)
  }

  const token = await createLoginToken(email, parsed.data.claimDraftId ?? null)
  const url = `${appUrl()}/api/auth/callback?token=${encodeURIComponent(token)}`

  await sendEmail({
    to: email,
    subject: 'Your FreelanceInvoice sign-in link',
    text: `Click to sign in:\n\n${url}\n\nThis link works once and expires in 15 minutes. If you didn't request it, you can ignore this email.`,
    html: renderEmailHtml({
      bodyText:
        'Click the button below to sign in to FreelanceInvoice.\n\nThis link works once and expires in 15 minutes.',
      ctaLabel: 'Sign in',
      ctaUrl: url,
      footerNote: "If you didn't request this, you can safely ignore it.",
    }),
  })

  // Always the same response, whether or not the address has an account —
  // otherwise this endpoint tells an attacker who is registered.
  return Response.json({ ok: true })
}
