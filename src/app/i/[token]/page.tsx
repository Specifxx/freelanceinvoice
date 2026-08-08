import type { Metadata } from 'next'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { db } from '@/db'
import { stripeConnections } from '@/db/schema'
import { InvoiceDocument } from '@/components/InvoiceDocument'
import { PayButton } from '@/components/PayButton'
import { Alert } from '@/components/ui'
import { getCurrentUser } from '@/lib/auth'
import { formatDateHuman, isOverdue } from '@/lib/dates'
import { clientIpFrom, recordEvent } from '@/lib/events'
import {
  getDocumentByToken,
  getOwnedDocumentById,
  recordFirstView,
  snapshotFor,
} from '@/lib/invoices'
import { formatMoney } from '@/lib/money'
import { isStripeConfigured } from '@/lib/stripe'

export const metadata: Metadata = {
  title: 'Invoice',
  // Belt and braces with the X-Robots-Tag header in next.config.ts. A client's
  // invoice must never appear in search results.
  robots: { index: false, follow: false },
}

// Every load records a view, so this can never be cached.
export const dynamic = 'force-dynamic'

export default async function PublicInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ paid?: string }>
}) {
  const { token } = await params
  const { paid } = await searchParams

  const doc = await getDocumentByToken(token)
  // Unsent drafts have a token but are not yet a real invoice.
  if (!doc || !doc.sentAt || !doc.ownerId) notFound()

  const owner = (await getOwnedDocumentById(doc.id))?.owner ?? null
  const snapshot = snapshotFor(doc, owner)

  const headerList = await headers()
  const ip = clientIpFrom(headerList)

  // Suppress self-views: previewing your own invoice must not fake a "Viewed".
  const isOwnerViewing = await viewerIsOwner(doc.ownerId)
  if (!isOwnerViewing) {
    const wasFirst = await recordFirstView(doc.id)
    await recordEvent({
      documentId: doc.id,
      type: 'viewed',
      ip,
      userAgent: headerList.get('user-agent'),
      meta: { first: wasFirst },
    })
  }

  const [connection] = await db
    .select()
    .from(stripeConnections)
    .where(eq(stripeConnections.userId, doc.ownerId))
    .limit(1)

  const canPayByCard =
    isStripeConfigured() && Boolean(connection?.chargesEnabled) && !doc.paidAt

  const overdue = !doc.paidAt && isOverdue(doc.dueDate)

  return (
    <div className="min-h-screen bg-slate-100 py-8">
      <div className="mx-auto max-w-3xl space-y-4 px-4">
        {doc.paidAt ? (
          <Alert tone="success">
            Paid on {formatDateHuman(doc.paidAt.toISOString().slice(0, 10))}. Thank you.
          </Alert>
        ) : paid ? (
          <Alert tone="info">
            Thanks — we&rsquo;re confirming your payment with the bank. This page
            updates to Paid within a moment.
          </Alert>
        ) : overdue ? (
          <Alert tone="warning">
            This invoice was due on {formatDateHuman(doc.dueDate)}.
          </Alert>
        ) : null}

        <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-200">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {formatMoney(doc.totalCents, doc.currency)}
              {doc.paidAt ? '' : ` due ${formatDateHuman(doc.dueDate)}`}
            </p>
            <p className="text-xs text-slate-500">
              From {snapshot.business.name}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/i/${token}/pdf`}
              className="inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 ring-1 ring-slate-300 ring-inset hover:bg-slate-50"
            >
              Download PDF
            </a>
            {canPayByCard ? (
              <PayButton
                token={token}
                amountLabel={formatMoney(doc.totalCents, doc.currency)}
              />
            ) : null}
          </div>
        </div>

        {!canPayByCard && !doc.paidAt && snapshot.invoice.bankDetails ? (
          <Alert tone="info">
            Card payment isn&rsquo;t available on this invoice — please use the
            payment details shown below.
          </Alert>
        ) : null}

        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <InvoiceDocument snapshot={snapshot} />
        </div>

        <p className="no-print pb-8 text-center text-xs text-slate-500">
          Card payments are handled by Stripe. Neither this page nor{' '}
          {snapshot.business.name} ever sees your card details.
        </p>
      </div>
    </div>
  )
}

/**
 * True when the signed-in viewer owns this invoice, so previewing your own
 * invoice never fakes a "Viewed" status for the client.
 */
async function viewerIsOwner(ownerId: string): Promise<boolean> {
  try {
    const user = await getCurrentUser()
    return user?.id === ownerId
  } catch {
    return false
  }
}
