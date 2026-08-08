'use client'

import { useState } from 'react'
import { Alert, Button, Field, Input } from './ui'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setStatus('sending')
    setError(null)
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'Could not send the link')
      }
      setStatus('sent')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  if (status === 'sent') {
    return (
      <Alert tone="success">
        Check your inbox — we sent a sign-in link to <strong>{email}</strong>. It
        works once and expires in 15 minutes.
      </Alert>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoFocus
          autoComplete="email"
        />
      </Field>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="submit" disabled={status === 'sending' || !email} className="w-full">
        {status === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
      </Button>
    </form>
  )
}
