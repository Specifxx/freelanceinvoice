import type { Metadata } from 'next'
import Link from 'next/link'
import { createInvoiceAction } from '../actions'
import { Badge, Button, ButtonLink, EmptyState } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { formatDateHuman } from '@/lib/dates'
import { checkCanSend } from '@/lib/entitlements'
import {
  countSentThisPeriod,
  displayStatus,
  listOwnedInvoices,
  STATUS_LABELS,
  STATUS_STYLES,
} from '@/lib/invoices'
import { formatMoney } from '@/lib/money'

export const metadata: Metadata = { title: 'Invoices', robots: { index: false } }

export default async function InvoicesPage() {
  const user = await requireUser()
  const [invoices, sentThisPeriod] = await Promise.all([
    listOwnedInvoices(user.id),
    countSentThisPeriod(user.id),
  ])
  const sendCheck = checkCanSend(user.plan, sentThisPeriod)

  const outstandingCents = invoices
    .filter((i) => i.sentAt && !i.paidAt)
    .reduce((sum, i) => sum + i.totalCents, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Invoices</h1>
          {outstandingCents > 0 ? (
            <p className="mt-1 text-sm text-slate-600">
              {formatMoney(outstandingCents, invoices[0]?.currency ?? 'USD')} outstanding
            </p>
          ) : null}
        </div>
        <form action={createInvoiceAction}>
          <Button type="submit">New invoice</Button>
        </form>
      </div>

      {!sendCheck.allowed ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200 ring-inset">
          <span>{sendCheck.reason}</span>
          <ButtonLink href="/billing" size="sm">
            Upgrade
          </ButtonLink>
        </div>
      ) : null}

      {invoices.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="Create your first invoice. It takes about a minute, and reminders are switched on by default so you never have to send a follow-up yourself."
          action={
            <form action={createInvoiceAction}>
              <Button type="submit">Create your first invoice</Button>
            </form>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Due</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const status = displayStatus(invoice)
                return (
                  <tr
                    key={invoice.id}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={
                          invoice.sentAt
                            ? `/invoices/${invoice.id}`
                            : `/invoices/${invoice.id}/edit`
                        }
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {invoice.number ?? 'Draft'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {invoice.clientName || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDateHuman(invoice.dueDate)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {formatMoney(invoice.totalCents, invoice.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={STATUS_STYLES[status]}>
                        {STATUS_LABELS[status]}
                      </Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
