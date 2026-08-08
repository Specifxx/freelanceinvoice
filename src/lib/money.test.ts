import { describe, expect, it } from 'vitest'
import {
  centsToInput,
  formatMoney,
  isZeroDecimal,
  parseMoneyToCents,
  roundHalfAwayFromZero,
} from './money'

describe('roundHalfAwayFromZero', () => {
  it('rounds .5 up for positives', () => {
    expect(roundHalfAwayFromZero(0.5)).toBe(1)
    expect(roundHalfAwayFromZero(2.5)).toBe(3)
  })

  it('rounds .5 away from zero for negatives, unlike Math.round', () => {
    // Math.round(-0.5) is -0, which would under-charge on discount lines.
    expect(roundHalfAwayFromZero(-0.5)).toBe(-1)
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3)
  })

  it('leaves integers alone', () => {
    expect(roundHalfAwayFromZero(7)).toBe(7)
    expect(roundHalfAwayFromZero(-7)).toBe(-7)
  })
})

describe('parseMoneyToCents', () => {
  it('parses plain decimals', () => {
    expect(parseMoneyToCents('12.34')).toBe(1234)
    expect(parseMoneyToCents('0.05')).toBe(5)
    expect(parseMoneyToCents('100')).toBe(10_000)
  })

  it('strips currency symbols and spaces', () => {
    expect(parseMoneyToCents('$1,234.56')).toBe(123_456)
    expect(parseMoneyToCents('  £99.99 ')).toBe(9999)
  })

  it('handles European grouping where comma is the decimal separator', () => {
    expect(parseMoneyToCents('1.234,56')).toBe(123_456)
    expect(parseMoneyToCents('99,50')).toBe(9950)
  })

  it('handles negatives for discount lines', () => {
    expect(parseMoneyToCents('-50.00')).toBe(-5000)
  })

  it('returns null rather than 0 for unparseable input', () => {
    // Returning 0 here would silently invoice a client for nothing.
    expect(parseMoneyToCents('')).toBeNull()
    expect(parseMoneyToCents('abc')).toBeNull()
    expect(parseMoneyToCents(null)).toBeNull()
    expect(parseMoneyToCents(undefined)).toBeNull()
    expect(parseMoneyToCents('-')).toBeNull()
  })

  it('treats zero-decimal currencies as whole units', () => {
    expect(parseMoneyToCents('1200', 'JPY')).toBe(1200)
    expect(parseMoneyToCents('1200', 'USD')).toBe(120_000)
  })

  it('avoids binary float drift on common values', () => {
    // 1.15 * 100 is 114.99999999999999 in IEEE 754.
    expect(parseMoneyToCents('1.15')).toBe(115)
    expect(parseMoneyToCents('8.29')).toBe(829)
  })
})

describe('formatMoney', () => {
  // ICU emits U+00A0 between a currency code and its amount, and which
  // separator it picks varies by Node/ICU version. Normalise so these
  // assertions test our formatting rather than the platform's whitespace.
  const norm = (s: string) => s.replace(/ /g, ' ')

  it('formats major units from cents', () => {
    expect(norm(formatMoney(123_456, 'USD'))).toBe('$1,234.56')
  })

  it('omits minor units for zero-decimal currencies', () => {
    expect(norm(formatMoney(1200, 'JPY'))).toBe('¥1,200')
  })

  it('lets Intl handle well-formed but unrecognised codes', () => {
    // 'ZZZ' is a structurally valid ISO-4217 code, so Intl renders it rather
    // than throwing — our fallback is not involved here.
    expect(norm(formatMoney(1000, 'ZZZ'))).toBe('ZZZ 10.00')
  })

  it('falls back readably when Intl rejects the code outright', () => {
    // Anything not three letters throws RangeError inside Intl.
    expect(norm(formatMoney(1000, 'DOLLARS'))).toBe('DOLLARS 10.00')
    expect(norm(formatMoney(1000, 'US'))).toBe('US 10.00')
  })
})

describe('isZeroDecimal / centsToInput', () => {
  it('knows the zero-decimal set', () => {
    expect(isZeroDecimal('JPY')).toBe(true)
    expect(isZeroDecimal('jpy')).toBe(true)
    expect(isZeroDecimal('USD')).toBe(false)
  })

  it('round-trips through the editable input format', () => {
    expect(centsToInput(123_456)).toBe('1234.56')
    expect(parseMoneyToCents(centsToInput(99))).toBe(99)
    expect(centsToInput(1200, 'JPY')).toBe('1200')
  })
})
