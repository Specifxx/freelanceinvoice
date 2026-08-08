'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from './ui'

export function InvoiceActions({
  documentId,
  publicUrl,
  isPaid,
  isSent,
}: {
  documentId: string
  publicUrl: string
  isPaid: boolean
  isSent: boolean
}) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard needs a secure context and permission; fall back to a prompt
      // rather than failing silently.
      window.prompt('Copy this invoice link:', publicUrl)
    }
  }

  async function markPaid() {
    if (!window.confirm('Mark this invoice as paid? Reminders will stop immediately.')) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/documents/${documentId}/mark-paid`, { method: 'POST' })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'Could not mark as paid')
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={`/api/documents/${documentId}/pdf`}
        className="inline-flex items-center rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 ring-1 ring-slate-300 ring-inset hover:bg-slate-50"
      >
        PDF
      </a>

      {isSent ? (
        <Button type="button" variant="secondary" size="sm" onClick={copyLink}>
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      ) : null}

      {isSent && !isPaid ? (
        <Button
          type="button"
          variant="success"
          size="sm"
          onClick={markPaid}
          disabled={busy}
        >
          {busy ? 'Saving…' : 'Mark as paid'}
        </Button>
      ) : null}

      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  )
}
