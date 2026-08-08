import { computeLineAmountCents, computeTotals } from './totals'

/**
 * Pure, dependency-free snapshot construction — no database imports, so the
 * invoice builder can render a live preview in the browser using exactly the
 * same code that freezes the invoice on the server at send time. What you
 * preview is what your client receives.
 */

export type SnapshotBusiness = {
  name: string
  address: string | null
  email: string | null
  phone: string | null
  logoUrl: string | null
}

export type SnapshotClient = {
  name: string | null
  email: string | null
  address: string | null
}

export type SnapshotItem = {
  description: string
  quantity: string
  unit: string | null
  unitPriceCents: number
  amountCents: number
}

export type InvoiceSnapshot = {
  version: 1
  business: SnapshotBusiness
  client: SnapshotClient
  invoice: {
    number: string
    issueDate: string
    dueDate: string
    currency: string
    notes: string | null
    terms: string | null
    taxLabel: string
    taxRateBps: number
    bankDetails: string | null
  }
  items: SnapshotItem[]
  totals: { subtotalCents: number; taxCents: number; totalCents: number }
  theme: { themeId: string; accentColor: string }
  showsOurBranding: boolean
}

export type SnapshotParts = {
  business: SnapshotBusiness
  client: SnapshotClient
  invoice: InvoiceSnapshot['invoice']
  items: Array<{
    description: string
    quantity: string | number
    unit?: string | null
    unitPriceCents: number
    taxable?: boolean
  }>
  theme: { themeId: string; accentColor: string }
  showsOurBranding: boolean
}

/** Totals are always recomputed here — never carried in from a caller. */
export function buildSnapshotFromParts(parts: SnapshotParts): InvoiceSnapshot {
  const totals = computeTotals(
    parts.items.map((i) => ({
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      taxable: i.taxable,
    })),
    parts.invoice.taxRateBps,
  )

  return {
    version: 1,
    business: parts.business,
    client: parts.client,
    invoice: parts.invoice,
    items: parts.items.map((item) => ({
      description: item.description,
      quantity: String(item.quantity),
      unit: item.unit ?? null,
      unitPriceCents: item.unitPriceCents,
      amountCents: computeLineAmountCents(item.quantity, item.unitPriceCents),
    })),
    totals: {
      subtotalCents: totals.subtotalCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
    },
    theme: parts.theme,
    showsOurBranding: parts.showsOurBranding,
  }
}

export function isInvoiceSnapshot(value: unknown): value is InvoiceSnapshot {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { version?: unknown }).version === 1
  )
}
