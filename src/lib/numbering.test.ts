import { describe, expect, it } from 'vitest'
import { DEFAULT_NUMBER_FORMAT, formatInvoiceNumber } from './numbering'

describe('formatInvoiceNumber', () => {
  it('renders the default pattern with zero padding', () => {
    expect(formatInvoiceNumber(DEFAULT_NUMBER_FORMAT, 7, '2026-09-30')).toBe(
      'INV-2026-0007',
    )
  })

  it('supports every date token', () => {
    expect(formatInvoiceNumber('{YYYY}{MM}{DD}-{000}', 12, '2026-09-05')).toBe(
      '20260905-012',
    )
    expect(formatInvoiceNumber('{YY}-{00}', 3, '2026-09-05')).toBe('26-03')
  })

  it('respects the padding width given', () => {
    expect(formatInvoiceNumber('{000000}', 42, '2026-01-01')).toBe('000042')
  })

  it('does not truncate a sequence longer than the padding', () => {
    expect(formatInvoiceNumber('INV-{00}', 12_345, '2026-01-01')).toBe('INV-12345')
  })

  it('appends a sequence when the pattern has no number token', () => {
    // Otherwise every invoice that year would share a number.
    expect(formatInvoiceNumber('INV-{YYYY}', 9, '2026-01-01')).toBe('INV-2026-9')
  })

  it('does not double the separator when the pattern already ends in one', () => {
    expect(formatInvoiceNumber('INV-', 9, '2026-01-01')).toBe('INV-9')
  })

  it('supports a custom prefix', () => {
    expect(formatInvoiceNumber('ROWAN/{YYYY}/{0000}', 1, '2026-03-01')).toBe(
      'ROWAN/2026/0001',
    )
  })
})
