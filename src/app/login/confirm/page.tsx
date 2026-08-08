import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/marketing'
import { Button } from '@/components/ui'
import { peekLoginToken } from '@/lib/auth'

export const metadata: Metadata = { title: 'Confirm sign-in', robots: { index: false } }

// The token must never be cached or prerendered.
export const dynamic = 'force-dynamic'

/**
 * The interstitial that makes magic links survive corporate mail gateways.
 * Reaching this page costs nothing — the token is only spent by the POST the
 * button submits, which a link scanner will not perform.
 */
export default async function ConfirmSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  if (!token) redirect('/login?error=missing')

  const info = await peekLoginToken(token)
  if (!info) redirect('/login?error=expired')

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-20">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Confirm sign-in
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Signing in as <strong className="text-slate-900">{info.email}</strong>.
          {info.hasDraft ? ' Your invoice is waiting on the other side.' : ''}
        </p>

        <form action="/api/auth/confirm" method="post" className="mt-6">
          <input type="hidden" name="token" value={token} />
          <Button type="submit" className="w-full" size="lg">
            Sign in
          </Button>
        </form>

        <p className="mt-6 text-xs text-slate-500">
          This extra tap exists because some email providers open links
          automatically to scan them. Requiring a click keeps your one-time link
          from being used up before you get here.
        </p>
      </main>
    </>
  )
}
