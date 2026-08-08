import type { Metadata } from 'next'
import { eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/db'
import { reminders as remindersTable, stripeConnections } from '@/db/schema'
import { duplicateInvoiceAction } from '../../actions'
import { InvoiceActions } from '@/components/InvoiceActions'
import { InvoiceDocument } from '@/components/InvoiceDocument'
import { Alert, Badge, Button, Card } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { formatDateHuman } from '@/lib/dates'
import { eventLabel, listEvents } from '@/lib/events'
import {
  displayStatus,
  getOwnedDocument,
  snapshotFor,
  STATUS_LABELS,
  STATUS_STYLES,
} from '@/lib/invoices'
import { appUrl } from '@/lib/email'

export const metadata: Metadata = { title: 'Invoice', robots: { index: false } }

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ sent?: string }>
}) {
  const { id } = await params
  const { sent } = await searchParams
  const user = await requireUser()

  const doc = await getOwnedDocument(id, user.id)
  if (!doc) notFound()

  const [events, scheduled, connection] = await Promise.all([
    listEvents(doc.id),
    db
      .select()
      .from(remindersTable)
      .where(eq(remindersTable.documentId, doc.id))
      .orderBy(remindersTable.scheduledFor),
    db
      .select()
      .from(stripeConnections)
      .where(eq(stripeConnections.userId, user.id))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ])

  const status = displayStatus(doc)
  const snapshot = snapshotFor(doc, user)
  const publicUrl = `${appUrl()}/i/${doc.publicToken}`
  const pending = scheduled.filter((r) => r.status === 'pending')

  return (
    <div className="space-y-6">
      {sent ? (
        <Alert tone="success">
          Invoice sent. {pending.length > 0
            ? `${pending.length} reminder${pending.length === 1 ? '' : 's'} scheduled — they stop automatically when it's paid.`
            : 'No reminders were scheduled, because the due date has already passed.'}
        </Alert>
      ) : null}

      {doc.sentAt && !connection?.chargesEnabled ? (
        <Alert tone="warning">
          Card payment isn&rsquo;t set up yet, so this invoice shows your bank
          details instead of a Pay button.{' '}
          <Link href="/settings" className="font-medium underline">
            Connect Stripe
          </Link>{' '}
          to let clients pay in one tap.
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {doc.number ?? 'Draft'}
            </h1>
            <Badge className={STATUS_STYLES[status]}>{STATUS_LABELS[status]}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {doc.clientName ?? 'No client'} · due {formatDateHuman(doc.dueDate)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {doc.sentAt ? (
            <form action={duplicateInvoiceAction}>
              <input type="hidden" name="id" value={doc.id} />
              <Button type="submit" variant="secondary" size="sm">
                Duplicate
              </Button>
            </form>
          ) : (
            <Link
              href={`/invoices/${doc.id}/edit`}
              className="inline-flex items-center rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 ring-1 ring-slate-300 ring-inset hover:bg-slate-50"
            >
              Edit
            </Link>
          )}
          <InvoiceActions
            documentId={doc.id}
            publicUrl={publicUrl}
            isPaid={Boolean(doc.paidAt)}
            isSent={Boolean(doc.sentAt)}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div className="overflow-hidden rounded-xl shadow-sm ring-1 ring-slate-200">
          <InvoiceDocument snapshot={snapshot} />
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="text-sm font-semibold text-slate-900">Reminders</h2>
            {!doc.remindersEnabled ? (
              <p className="mt-3 text-sm text-slate-600">
                Switched off for this invoice.
              </p>
            ) : scheduled.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">
                {doc.sentAt
                  ? 'None scheduled — every step of the ladder was already past due when this was sent.'
                  : 'Scheduled automatically when you send.'}
              </p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {scheduled.map((reminder) => (
                  <li key={reminder.id} className="flex items-center justify-between gap-3">
                    <span className="text-slate-600">
                      {formatDateHuman(reminder.scheduledFor.toISOString().slice(0, 10))}
                    </span>
                    <Badge
                      className={
                        reminder.status === 'sent'
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                          : reminder.status === 'cancelled'
                            ? 'bg-slate-100 text-slate-500 ring-slate-200'
                            : 'bg-blue-50 text-blue-700 ring-blue-200'
                      }
                    >
                      {reminder.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-slate-900">Activity</h2>
            {events.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">Nothing yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {events.map((event) => (
                  <li key={event.id} className="flex justify-between gap-3 text-sm">
                    <span className="text-slate-900">{eventLabel(event.type)}</span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {event.occurredAt.toISOString().slice(0, 16).replace('T', ' ')} UTC
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
              &ldquo;Client opened the invoice&rdquo; is a real page view. Email-open
              tracking is unreliable and is not used for status.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}
