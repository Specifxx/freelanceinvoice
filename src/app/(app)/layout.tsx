import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { getEntitlements } from '@/lib/entitlements'
import { countSentThisPeriod } from '@/lib/invoices'
import { Badge } from '@/components/ui'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()
  const entitlements = getEntitlements(user.plan)
  const sent = await countSentThisPeriod(user.id)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/invoices" className="text-sm font-bold text-slate-900">
              FreelanceInvoice
            </Link>
            <nav className="flex items-center gap-1">
              {[
                { href: '/invoices', label: 'Invoices' },
                { href: '/settings', label: 'Settings' },
                { href: '/billing', label: 'Billing' },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {entitlements.monthlySendLimit !== null ? (
              <Badge
                className={
                  sent >= entitlements.monthlySendLimit
                    ? 'bg-amber-50 text-amber-800 ring-amber-200'
                    : 'bg-slate-100 text-slate-600 ring-slate-200'
                }
              >
                {sent}/{entitlements.monthlySendLimit} sent this month
              </Badge>
            ) : (
              <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">Pro</Badge>
            )}
            <span className="hidden text-xs text-slate-500 sm:inline">{user.email}</span>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  )
}
