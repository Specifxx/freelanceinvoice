'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { InvoiceDocument } from './InvoiceDocument'
import { Button, Field, Input, Select, Textarea, Alert, cn } from './ui'
import { addDaysIso } from '@/lib/dates'
import { centsToInput, parseMoneyToCents } from '@/lib/money'
import { buildSnapshotFromParts } from '@/lib/snapshot'
import { bpsToPercent, percentToBps, validateTaxPercent } from '@/lib/totals'
import type { LineItemPreset } from '@/niches'
import { THEME_LIST } from '@/themes'

export type BuilderItem = {
  key: string
  description: string
  quantity: string
  unit: string
  rate: string
}

export type BuilderState = {
  businessName: string
  businessEmail: string
  businessAddress: string
  clientName: string
  clientEmail: string
  clientAddress: string
  issueDate: string
  dueDate: string
  currency: string
  taxPercent: string
  taxLabel: string
  notes: string
  themeId: string
  accentColor: string
  remindersEnabled: boolean
  reminderTone: string
  items: BuilderItem[]
}

export type BuilderProps = {
  /**
   * null for a brand-new anonymous invoice — the row is created on the first
   * save, so a page view (or a bot, or a prefetch) never writes to the
   * database.
   */
  documentId: string | null
  initial: BuilderState
  presets: readonly LineItemPreset[]
  /** Anonymous visitors type their own business details and cannot send. */
  mode: 'anonymous' | 'owner'
  showsOurBranding: boolean
  /** Owner mode: sending is blocked once the free monthly allowance is used. */
  sendBlockedReason?: string | null
  /** Seeds the niche defaults on the lazily-created draft. */
  nicheSlug?: string | null
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'JPY', 'CHF', 'SEK', 'INR']

/** Points at the draft the anonymous builder was last working on. */
const LAST_DRAFT_KEY = 'fi_last_draft'

let keySeed = 0
function nextKey() {
  keySeed += 1
  return `row-${keySeed}-${Math.random().toString(36).slice(2, 8)}`
}

export function emptyItem(): BuilderItem {
  return { key: nextKey(), description: '', quantity: '1', unit: '', rate: '' }
}

export function InvoiceBuilder({
  documentId: initialDocumentId,
  initial,
  presets,
  mode,
  showsOurBranding,
  sendBlockedReason,
  nicheSlug,
}: BuilderProps) {
  const router = useRouter()
  const [documentId, setDocumentId] = useState<string | null>(initialDocumentId)
  const [state, setState] = useState<BuilderState>(initial)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [busy, setBusy] = useState<null | 'pdf' | 'send'>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSend, setShowSend] = useState(false)

  const set = useCallback(<K extends keyof BuilderState>(key: K, value: BuilderState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }))
  }, [])

  // --- autosave ------------------------------------------------------------
  // A refresh mid-invoice must never lose work. localStorage is the instant
  // backstop; the server save is what makes the draft claimable at signup.
  const firstRender = useRef(true)
  const savedRef = useRef<string>('')

  /**
   * Restore on mount. Mobile browsers evict background tabs aggressively — a
   * user who switches apps to look up a client's address comes back to a
   * reloaded page, and without this every line item they typed is gone.
   */
  useEffect(() => {
    if (initialDocumentId) return
    try {
      const storedId = localStorage.getItem(LAST_DRAFT_KEY)
      const raw = localStorage.getItem(`fi_draft_${storedId ?? 'new'}`)
      if (!raw) return
      const restored = JSON.parse(raw) as Partial<BuilderState>
      if (!Array.isArray(restored.items) || restored.items.length === 0) return
      // Keys are regenerated: React needs them unique, and a stale key from a
      // previous session can collide with a freshly added row.
      setState({
        ...initial,
        ...restored,
        items: restored.items.map((item) => ({ ...item, key: nextKey() })),
      })
      if (storedId) setDocumentId(storedId)
    } catch {
      // Corrupt or unreadable storage — start fresh rather than crash.
    }
    // Mount only: re-running would clobber edits made since.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const serialise = useCallback(
    (s: BuilderState) => ({
      businessName: s.businessName,
      businessEmail: s.businessEmail,
      businessAddress: s.businessAddress,
      clientName: s.clientName,
      clientEmail: s.clientEmail,
      clientAddress: s.clientAddress,
      issueDate: s.issueDate,
      dueDate: s.dueDate,
      currency: s.currency,
      taxRateBps: percentToBps(s.taxPercent || '0'),
      taxLabel: s.taxLabel,
      notes: s.notes,
      themeId: s.themeId,
      accentColor: s.accentColor,
      remindersEnabled: s.remindersEnabled,
      reminderTone: s.reminderTone,
      items: s.items
        .filter((i) => i.description.trim() !== '' || i.rate.trim() !== '')
        .map((i) => ({
          description: i.description,
          quantity: i.quantity || '1',
          unit: i.unit || null,
          unitPriceCents: parseMoneyToCents(i.rate, s.currency) ?? 0,
        })),
    }),
    [],
  )

  /** Resolves to the document id once saved, or null if the save failed. */
  const save = useCallback(async (): Promise<string | null> => {
    const body = JSON.stringify(serialise(state))
    let id = documentId

    setSaveState('saving')
    try {
      if (!id) {
        const created = await fetch(
          `/api/drafts${nicheSlug ? `?niche=${encodeURIComponent(nicheSlug)}` : ''}`,
          { method: 'POST' },
        )
        if (!created.ok) throw new Error(await readError(created))
        const data = (await created.json()) as { id: string }
        id = data.id
        setDocumentId(id)
        try {
          localStorage.setItem(LAST_DRAFT_KEY, id)
        } catch {
          // Storage unavailable; the id still lives in React state.
        }
      } else if (body === savedRef.current) {
        setSaveState('saved')
        return id
      }

      const res = await fetch(`/api/documents/${id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body,
      })
      if (!res.ok) throw new Error(await readError(res))
      savedRef.current = body
      setSaveState('saved')
      return id
    } catch (err) {
      setSaveState('error')
      setError(err instanceof Error ? err.message : 'Could not save')
      return null
    }
  }, [documentId, nicheSlug, serialise, state])

  useEffect(() => {
    try {
      localStorage.setItem(`fi_draft_${documentId ?? 'new'}`, JSON.stringify(state))
    } catch {
      // Private browsing or a full quota — the server save still covers us.
    }

    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const timer = setTimeout(() => void save(), 900)
    return () => clearTimeout(timer)
  }, [state, documentId, save])

  // --- derived preview -----------------------------------------------------
  const snapshot = useMemo(
    () =>
      buildSnapshotFromParts({
        business: {
          name: state.businessName || 'Your business',
          address: state.businessAddress || null,
          email: state.businessEmail || null,
          phone: null,
          logoUrl: null,
        },
        client: {
          name: state.clientName || null,
          email: state.clientEmail || null,
          address: state.clientAddress || null,
        },
        invoice: {
          number: 'DRAFT',
          issueDate: state.issueDate,
          dueDate: state.dueDate,
          currency: state.currency,
          notes: state.notes || null,
          terms: null,
          taxLabel: state.taxLabel,
          taxRateBps: percentToBps(state.taxPercent || '0'),
          bankDetails: null,
        },
        items: state.items.map((i) => ({
          description: i.description,
          quantity: i.quantity || '1',
          unit: i.unit || null,
          unitPriceCents: parseMoneyToCents(i.rate, state.currency) ?? 0,
        })),
        theme: { themeId: state.themeId, accentColor: state.accentColor },
        showsOurBranding,
      }),
    [state, showsOurBranding],
  )

  // Validated against the same bound the API enforces, so the preview can
  // never show a total the server would refuse to save.
  const taxError = validateTaxPercent(state.taxPercent)

  const hasContent =
    state.items.some((i) => i.description.trim() !== '') &&
    Boolean(state.clientName.trim()) &&
    !taxError

  // --- actions -------------------------------------------------------------

  async function handleDownloadPdf() {
    setError(null)
    setBusy('pdf')
    try {
      // Save first — the PDF renders server-side from the saved row, so an
      // unsaved edit would silently be missing from the download.
      const id = await save()
      if (!id) return
      window.location.href = `/api/documents/${id}/pdf`
    } finally {
      setTimeout(() => setBusy(null), 1200)
    }
  }

  async function handleSend(message: string) {
    setError(null)
    setBusy('send')
    try {
      const id = await save()
      if (!id) return
      const res = await fetch(`/api/documents/${id}/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      if (!res.ok) throw new Error(await readError(res))
      setShowSend(false)
      router.push(`/invoices/${id}?sent=1`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send')
    } finally {
      setBusy(null)
    }
  }

  const items = state.items

  function updateItem(key: string, patch: Partial<BuilderItem>) {
    setState((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.key === key ? { ...i, ...patch } : i)),
    }))
  }

  function addItem(preset?: LineItemPreset) {
    setState((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        preset
          ? {
              key: nextKey(),
              description: preset.description,
              quantity: String(preset.defaultQuantity),
              unit: preset.unit,
              rate: preset.defaultRateCents
                ? centsToInput(preset.defaultRateCents, prev.currency)
                : '',
            }
          : emptyItem(),
      ],
    }))
  }

  function removeItem(key: string) {
    setState((prev) => ({
      ...prev,
      // Never leave the table completely empty — an invoice needs a line.
      items: prev.items.length > 1 ? prev.items.filter((i) => i.key !== key) : prev.items,
    }))
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <div className="space-y-6">
        {error ? <Alert tone="error">{error}</Alert> : null}

        {mode === 'anonymous' ? (
          <section className="space-y-4 rounded-xl bg-white p-5 ring-1 ring-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">Your details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Business or your name">
                <Input
                  value={state.businessName}
                  onChange={(e) => set('businessName', e.target.value)}
                  placeholder="Rowan Studio"
                  autoFocus
                />
              </Field>
              <Field label="Your email">
                <Input
                  type="email"
                  value={state.businessEmail}
                  onChange={(e) => set('businessEmail', e.target.value)}
                  placeholder="you@example.com"
                />
              </Field>
            </div>
            <Field label="Address (optional)">
              <Textarea
                rows={2}
                value={state.businessAddress}
                onChange={(e) => set('businessAddress', e.target.value)}
              />
            </Field>
          </section>
        ) : null}

        <section className="space-y-4 rounded-xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Bill to</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client name">
              <Input
                value={state.clientName}
                onChange={(e) => set('clientName', e.target.value)}
                placeholder="Acme Ltd"
                autoFocus={mode === 'owner'}
              />
            </Field>
            <Field label="Client email" hint="Where the invoice and reminders go.">
              <Input
                type="email"
                value={state.clientEmail}
                onChange={(e) => set('clientEmail', e.target.value)}
                placeholder="accounts@acme.com"
              />
            </Field>
          </div>
          <Field label="Client address (optional)">
            <Textarea
              rows={2}
              value={state.clientAddress}
              onChange={(e) => set('clientAddress', e.target.value)}
            />
          </Field>
        </section>

        <section className="space-y-4 rounded-xl bg-white p-5 ring-1 ring-slate-200">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Issue date">
              <Input
                type="date"
                value={state.issueDate}
                onChange={(e) => {
                  const issueDate = e.target.value
                  setState((prev) => ({ ...prev, issueDate }))
                }}
              />
            </Field>
            <Field label="Due date">
              <Input
                type="date"
                value={state.dueDate}
                onChange={(e) => set('dueDate', e.target.value)}
              />
            </Field>
            <Field label="Currency">
              <Select
                value={state.currency}
                onChange={(e) => set('currency', e.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            {[7, 14, 30].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => set('dueDate', addDaysIso(state.issueDate, days))}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
              >
                Due in {days} days
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-xl bg-white p-5 ring-1 ring-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Line items</h2>
            <span className="text-xs text-slate-500">{items.length} line{items.length === 1 ? '' : 's'}</span>
          </div>

          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.key}
                className="grid grid-cols-12 items-end gap-2 rounded-lg bg-slate-50 p-3"
              >
                <div className="col-span-12 sm:col-span-5">
                  <Field label="Description">
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(item.key, { description: e.target.value })}
                      placeholder="What are you billing for?"
                    />
                  </Field>
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <Field label="Qty">
                    <Input
                      inputMode="decimal"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <Field label="Unit">
                    <Input
                      value={item.unit}
                      onChange={(e) => updateItem(item.key, { unit: e.target.value })}
                      placeholder="hour"
                    />
                  </Field>
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <Field label="Rate">
                    <Input
                      inputMode="decimal"
                      value={item.rate}
                      onChange={(e) => updateItem(item.key, { rate: e.target.value })}
                      placeholder="0.00"
                    />
                  </Field>
                </div>
                <div className="col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeItem(item.key)}
                    disabled={items.length === 1}
                    aria-label="Remove line"
                    className="rounded-md px-2 py-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => addItem()}>
              + Add line
            </Button>
            {presets.length > 0 ? (
              <Select
                className="max-w-[16rem] text-xs"
                value=""
                onChange={(e) => {
                  const preset = presets[Number(e.target.value)]
                  if (preset) addItem(preset)
                  e.target.value = ''
                }}
              >
                <option value="">Add a common item…</option>
                {presets.map((preset, index) => (
                  <option key={preset.description} value={index}>
                    {preset.description}
                  </option>
                ))}
              </Select>
            ) : null}
          </div>

          <div className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
            <Field label="Tax label">
              <Input
                value={state.taxLabel}
                onChange={(e) => set('taxLabel', e.target.value)}
                placeholder="VAT"
              />
            </Field>
            <Field
              label="Tax rate %"
              hint={taxError ?? "Leave at 0 if you don't charge tax."}
            >
              <Input
                inputMode="decimal"
                value={state.taxPercent}
                onChange={(e) => set('taxPercent', e.target.value)}
                aria-invalid={taxError ? true : undefined}
                className={taxError ? 'ring-red-400 focus:ring-red-500' : undefined}
              />
            </Field>
          </div>
        </section>

        <section className="space-y-4 rounded-xl bg-white p-5 ring-1 ring-slate-200">
          <Field label="Notes / terms" hint="Prints at the bottom of the invoice.">
            <Textarea
              rows={3}
              value={state.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Theme">
              <Select value={state.themeId} onChange={(e) => set('themeId', e.target.value)}>
                {THEME_LIST.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.name} — {theme.description}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Accent colour">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={state.accentColor}
                  onChange={(e) => set('accentColor', e.target.value)}
                  className="h-9 w-14 cursor-pointer rounded border border-slate-300"
                  aria-label="Accent colour"
                />
                <Input
                  value={state.accentColor}
                  onChange={(e) => set('accentColor', e.target.value)}
                />
              </div>
            </Field>
          </div>

          {mode === 'owner' ? (
            <div className="rounded-lg bg-slate-50 p-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={state.remindersEnabled}
                  onChange={(e) => set('remindersEnabled', e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300"
                />
                <span className="text-sm">
                  <span className="font-medium text-slate-900">
                    Chase this invoice automatically
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-600">
                    Reminders 3 days before the due date, on the day, then at 3, 7
                    and 14 days overdue. They stop the moment it&rsquo;s paid.
                  </span>
                </span>
              </label>
              {state.remindersEnabled ? (
                <div className="mt-3 pl-7">
                  <Select
                    className="max-w-[12rem] text-xs"
                    value={state.reminderTone}
                    onChange={(e) => set('reminderTone', e.target.value)}
                  >
                    <option value="friendly">Friendly tone</option>
                    <option value="firm">Firm tone</option>
                  </Select>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      <div className="space-y-4 lg:sticky lg:top-6">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {saveState === 'saving'
              ? 'Saving…'
              : saveState === 'saved'
                ? 'Saved'
                : saveState === 'error'
                  ? 'Not saved'
                  : 'Live preview'}
          </span>
          {mode === 'anonymous' ? (
            <span className="text-xs text-slate-500">No account needed</span>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-xl shadow-sm ring-1 ring-slate-200">
          <InvoiceDocument snapshot={snapshot} />
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={handleDownloadPdf}
            disabled={busy !== null}
          >
            {busy === 'pdf' ? 'Preparing…' : 'Download PDF'}
          </Button>

          {mode === 'anonymous' ? (
            <ClaimAndSend ensureSaved={save} disabled={!hasContent} />
          ) : (
            <Button
              type="button"
              onClick={() => setShowSend(true)}
              disabled={busy !== null || !hasContent}
            >
              Send &amp; get paid →
            </Button>
          )}
        </div>

        {taxError ? (
          <p className="text-xs text-red-600">{taxError}</p>
        ) : !hasContent ? (
          <p className="text-xs text-slate-500">
            Add a client name and at least one line item to send.
          </p>
        ) : null}

        {sendBlockedReason ? (
          <Alert tone="warning">{sendBlockedReason}</Alert>
        ) : null}
      </div>

      {showSend ? (
        <SendSheet
          clientEmail={state.clientEmail}
          clientName={state.clientName}
          busy={busy === 'send'}
          onCancel={() => setShowSend(false)}
          onSend={handleSend}
        />
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------

function SendSheet({
  clientEmail,
  clientName,
  busy,
  onCancel,
  onSend,
}: {
  clientEmail: string
  clientName: string
  busy: boolean
  onCancel: () => void
  onSend: (message: string) => void
}) {
  const [message, setMessage] = useState(
    `Hi ${clientName || 'there'},\n\nPlease find the invoice attached below. You can pay it with the button on the invoice.\n\nThanks!`,
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <div className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-base font-semibold text-slate-900">Send invoice</h2>

        {clientEmail ? (
          <p className="text-sm text-slate-600">
            Sending to <span className="font-medium text-slate-900">{clientEmail}</span>.
            Replies come straight back to you.
          </p>
        ) : (
          <Alert tone="error">
            Add a client email address before sending.
          </Alert>
        )}

        <Field label="Message">
          <Textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => onSend(message)}
            disabled={busy || !clientEmail}
          >
            {busy ? 'Sending…' : 'Send invoice'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * The conversion gate. Anonymous visitors can download all day, but sending
 * requires a verified email — which is also what stops the free tool being
 * used as a spam relay.
 */
function ClaimAndSend({
  ensureSaved,
  disabled,
}: {
  ensureSaved: () => Promise<string | null>
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setStatus('sending')
    setError(null)
    try {
      // Flush the draft before requesting the link, so the id we ask to claim
      // definitely exists and holds the latest edits.
      const documentId = await ensureSaved()
      if (!documentId) throw new Error('Could not save your invoice. Try again.')

      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, claimDraftId: documentId }),
      })
      if (!res.ok) throw new Error(await readError(res))
      setStatus('sent')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)} disabled={disabled}>
        Send &amp; get paid →
      </Button>
    )
  }

  return (
    <div className="w-full space-y-3 rounded-xl bg-white p-4 ring-1 ring-slate-200">
      {status === 'sent' ? (
        <Alert tone="success">
          Check your inbox — we sent a link to <strong>{email}</strong>. Opening it
          brings this invoice with you, ready to send.
        </Alert>
      ) : (
        <>
          <p className="text-sm text-slate-700">
            Enter your email to send this invoice, track when it&rsquo;s opened, and
            get paid by card. Your draft comes with you.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && email) void submit()
              }}
            />
            <Button
              type="button"
              onClick={submit}
              disabled={status === 'sending' || !email}
              className={cn('shrink-0')}
            >
              {status === 'sending' ? 'Sending…' : 'Continue'}
            </Button>
          </div>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <p className="text-xs text-slate-500">
            No password. We&rsquo;ll email you a link.
          </p>
        </>
      )}
    </div>
  )
}

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string }
    return data.error ?? `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}

export { bpsToPercent }
