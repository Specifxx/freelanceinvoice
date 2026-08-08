/**
 * Money is integer minor units ("cents") plus an ISO-4217 code. Never floats.
 * Every arithmetic helper here is closed over integers.
 */

/**
 * Rounds half away from zero, which is what invoices conventionally do.
 * `Math.round` alone rounds -0.5 to -0, which quietly under-charges on
 * negative (discount) lines.
 */
export function roundHalfAwayFromZero(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n)
}

/** Currencies with no minor unit — a "cent" is a whole unit. */
const ZERO_DECIMAL = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA',
  'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
])

export function isZeroDecimal(currency: string): boolean {
  return ZERO_DECIMAL.has(currency.toUpperCase())
}

export function formatMoney(
  cents: number,
  currency = 'USD',
  locale = 'en-US',
): string {
  const code = currency.toUpperCase()
  const zero = isZeroDecimal(code)
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: zero ? 0 : 2,
      maximumFractionDigits: zero ? 0 : 2,
    }).format(zero ? cents : cents / 100)
  } catch {
    // Unknown currency code — fall back to a plain, unambiguous rendering.
    const amount = zero ? String(cents) : (cents / 100).toFixed(2)
    return `${code} ${amount}`
  }
}

/**
 * Parses user input ("1,234.56", "$1234.56", "1234") into integer cents.
 * Returns null for anything it cannot read, so callers must handle failure
 * rather than silently invoicing for zero.
 */
export function parseMoneyToCents(
  input: string | number | null | undefined,
  currency = 'USD',
): number | null {
  if (input === null || input === undefined) return null
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null
    return roundHalfAwayFromZero(isZeroDecimal(currency) ? input : input * 100)
  }

  const cleaned = input.trim().replace(/[^0-9.,\-]/g, '')
  if (!cleaned || cleaned === '-') return null

  // Treat the last separator as the decimal point; strip the rest as grouping.
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  let normalised: string
  if (lastComma > lastDot) {
    normalised = cleaned.replace(/\./g, '').replace(',', '.')
  } else {
    normalised = cleaned.replace(/,/g, '')
  }

  const value = Number(normalised)
  if (!Number.isFinite(value)) return null
  return roundHalfAwayFromZero(isZeroDecimal(currency) ? value : value * 100)
}

/** Renders cents as a plain editable decimal string (no symbol, no grouping). */
export function centsToInput(cents: number, currency = 'USD'): string {
  return isZeroDecimal(currency) ? String(cents) : (cents / 100).toFixed(2)
}
