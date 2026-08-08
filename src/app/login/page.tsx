import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/LoginForm'
import { SiteHeader } from '@/components/marketing'
import { Alert } from '@/components/ui'
import { getCurrentUser } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false },
}

const ERRORS: Record<string, string> = {
  expired: 'That sign-in link has expired or was already used. Request a new one.',
  missing: 'That link was incomplete. Request a new one below.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const user = await getCurrentUser().catch(() => null)
  if (user) redirect('/invoices')

  const { error } = await searchParams

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-20">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            No password. We&rsquo;ll email you a link that signs you straight in.
          </p>
        </div>

        {error && ERRORS[error] ? <Alert tone="warning">{ERRORS[error]}</Alert> : null}

        <LoginForm />

        <p className="text-sm text-slate-500">
          Just want a PDF?{' '}
          <Link href="/free-invoice-generator" className="underline hover:text-slate-900">
            Use the free generator
          </Link>{' '}
          — no account needed.
        </p>
      </main>
    </>
  )
}
