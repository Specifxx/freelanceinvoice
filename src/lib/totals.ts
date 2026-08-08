import { roundHalfAwayFromZero } from './money'

export type TotalsInput = {
  quantity: string | number
  unitPriceCents: number
  taxable?: boolean
}

export type Totals = {
  subtotalCents: number
  taxableBaseCents: number
  taxCents: number
  totalCents: number
}

/**
 * Quantities carry up to 3 decimals (numeric(12,3)). Scaling to integer
 * milli-units before multiplying keeps 0.1 * 3 from drifting off a cent.
 */
export function computeLineAmountCents(
  quantity: string | number,
  unitPriceCents: number,
): number {
  const qty = typeof quantity === 'string' ? Number(quantity) : quantity
  if (!Number.isFinite(qty) || !Number.isFinite(unitPriceCents)) return 0
  const milliQty = roundHalfAwayFromZero(qty * 1000)
  return roundHalfAwayFromZero((milliQty * unitPriceCents) / 1000)
}

/**
 * Tax is applied once to the taxable subtotal rather than per line, so the
 * printed total always equals subtotal + tax exactly. Per-line rounding would
 * leave the two disagreeing by a cent on some inputs.
 */
export function computeTotals(
  items: readonly TotalsInput[],
  taxRateBps: number,
): Totals {
  let subtotalCents = 0
  let taxableBaseCents = 0

  for (const item of items) {
    const amount = computeLineAmountCents(item.quantity, item.unitPriceCents)
    subtotalCents += amount
    if (item.taxable !== false) taxableBaseCents += amount
  }

  const bps = Number.isFinite(taxRateBps) ? taxRateBps : 0
  const taxCents = roundHalfAwayFromZero((taxableBaseCents * bps) / 10_000)

  return {
    subtotalCents,
    taxableBaseCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
  }
}

/**
 * Upper bound on a tax rate, shared by the builder and the API schema so the
 * live preview can never render a value the server would reject.
 */
export const MAX_TAX_PERCENT = 1000
export const MAX_TAX_BPS = MAX_TAX_PERCENT * 100

/** Basis points from a human percentage: 8.25 -> 825. */
export function percentToBps(percent: string | number): number {
  const n = typeof percent === 'string' ? Number(percent) : percent
  if (!Number.isFinite(n)) return 0
  return roundHalfAwayFromZero(n * 100)
}

/** Human-readable reason a tax rate is unusable, or null when it is fine. */
export function validateTaxPercent(percent: string): string | null {
  const trimmed = percent.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return 'Enter a number, for example 20 or 8.25.'
  if (n < 0) return 'Tax rate cannot be negative.'
  if (n > MAX_TAX_PERCENT) return `Tax rate cannot be above ${MAX_TAX_PERCENT}%.`
  return null
}

export function bpsToPercent(bps: number): number {
  return bps / 100
}
