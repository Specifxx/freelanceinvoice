import { redirect } from 'next/navigation'

export const runtime = 'nodejs'

/**
 * Mail scanners GET every URL in a message. Signing in here would hand a live
 * session to a bot and spend the user's single-use token before they ever click
 * it — with no password to fall back on, that locks them out permanently.
 *
 * So the GET does nothing but forward to a page with a Confirm button, which
 * POSTs. Scanners follow links; they do not submit forms.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')
  if (!token) redirect('/login?error=missing')
  redirect(`/login/confirm?token=${encodeURIComponent(token)}`)
}
