import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { InvoiceBuilder } from '@/components/InvoiceBuilder'
import { Alert } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { builderStateFromDocument } from '@/lib/builder-defaults'
import { checkCanSend } from '@/lib/entitlements'
import { countSentThisPeriod, getOwnedDocument } from '@/lib/invoices'
import { presetsFor } from '@/niches'

export const metadata: Metadata = { title: 'Edit invoice', robots: { index: false } }

export default async function EditInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ claimed?: string }>
}) {
  const { id } = await params
  const { claimed } = await searchParams
  const user = await requireUser()

  const doc = await getOwnedDocument(id, user.id)
  if (!doc) notFound()

  // A sent invoice is the record of what the client received. Editing it is
  // not an option; duplicating is.
  if (doc.sentAt) redirect(`/invoices/${id}`)

  const sentThisPeriod = await countSentThisPeriod(user.id)
  const sendCheck = checkCanSend(user.plan, sentThisPeriod)

  return (
    <div className="space-y-6">
      {claimed ? (
        <Alert tone="success">
          Your invoice came with you. Add the client&rsquo;s email and send it
          whenever you&rsquo;re ready.
        </Alert>
      ) : null}

      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        {doc.number ?? 'New invoice'}
      </h1>

      <InvoiceBuilder
        documentId={doc.id}
        initial={builderStateFromDocument(doc, user)}
        presets={presetsFor(doc.nicheSlug ?? user.nicheSlug)}
        mode="owner"
        showsOurBranding={user.plan !== 'pro'}
        sendBlockedReason={sendCheck.allowed ? null : sendCheck.reason}
      />
    </div>
  )
}
