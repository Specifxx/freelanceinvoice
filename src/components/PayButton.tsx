'use client'

import { useState } from 'react'
import { Button } from './ui'

export function PayButton({
  token,
  amountLabel,
}: {
  token: string
  amountLabel: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pay() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/i/${token}/pay`, { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as {
        url?: string
        error?: string
      }
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? 'Could not start checkout')
      }
      // Full navigation, not a router push — Stripe Checkout is off-site.
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" onClick={pay} disabled={busy}>
        {busy ? 'Opening…' : `Pay ${amountLabel}`}
      </Button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  )
}
