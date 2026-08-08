import { describe, expect, it } from 'vitest'
import {
  bpsToPercent,
  computeLineAmountCents,
  computeTotals,
  percentToBps,
} from './totals'

describe('computeLineAmountCents', () => {
  it('multiplies whole quantities', () => {
    expect(computeLineAmountCents(3, 5000)).toBe(15_000)
  })

  it('handles fractional quantities without float drift', () => {
    expect(computeLineAmountCents(0.1, 3000)).toBe(300)
    expect(computeLineAmountCents(1.5, 6500)).toBe(9750)
    // 2.675 * 10000 drifts low in IEEE 754.
    expect(computeLineAmountCents(2.675, 10_000)).toBe(26_750)
  })

  it('accepts numeric strings, as they come back from the driver', () => {
    expect(computeLineAmountCents('2.500', 4000)).toBe(10_000)
  })

  it('rounds half away from zero', () => {
    // 0.005 * 100 = 0.5 cents
    expect(computeLineAmountCents(0.005, 100)).toBe(1)
  })

  it('returns 0 for unusable input instead of NaN', () => {
    expect(computeLineAmountCents('abc', 100)).toBe(0)
    expect(computeLineAmountCents(1, Number.NaN)).toBe(0)
  })
})

describe('computeTotals', () => {
  it('sums lines and applies tax to the taxable base', () => {
    const totals = computeTotals(
      [
        { quantity: 2, unitPriceCents: 10_000 },
        { quantity: 1, unitPriceCents: 5_000 },
      ],
      2000, // 20%
    )
    expect(totals.subtotalCents).toBe(25_000)
    expect(totals.taxableBaseCents).toBe(25_000)
    expect(totals.taxCents).toBe(5_000)
    expect(totals.totalCents).toBe(30_000)
  })

  it('excludes non-taxable lines from the tax base but not the subtotal', () => {
    const totals = computeTotals(
      [
        { quantity: 1, unitPriceCents: 10_000, taxable: true },
        { quantity: 1, unitPriceCents: 4_000, taxable: false },
      ],
      1000, // 10%
    )
    expect(totals.subtotalCents).toBe(14_000)
    expect(totals.taxableBaseCents).toBe(10_000)
    expect(totals.taxCents).toBe(1_000)
    expect(totals.totalCents).toBe(15_000)
  })

  it('always keeps total === subtotal + tax exactly', () => {
    // Per-line tax rounding would leave the printed total a cent adrift.
    const totals = computeTotals(
      [
        { quantity: 3, unitPriceCents: 333 },
        { quantity: 7, unitPriceCents: 777 },
        { quantity: 1, unitPriceCents: 1 },
      ],
      825, // 8.25%
    )
    expect(totals.totalCents).toBe(totals.subtotalCents + totals.taxCents)
  })

  it('handles a zero tax rate', () => {
    const totals = computeTotals([{ quantity: 1, unitPriceCents: 12_345 }], 0)
    expect(totals.taxCents).toBe(0)
    expect(totals.totalCents).toBe(12_345)
  })

  it('handles negative (discount) lines', () => {
    const totals = computeTotals(
      [
        { quantity: 1, unitPriceCents: 20_000 },
        { quantity: 1, unitPriceCents: -5_000 },
      ],
      1000,
    )
    expect(totals.subtotalCents).toBe(15_000)
    expect(totals.taxCents).toBe(1_500)
    expect(totals.totalCents).toBe(16_500)
  })

  it('returns zeroes for an empty invoice', () => {
    expect(computeTotals([], 2000)).toEqual({
      subtotalCents: 0,
      taxableBaseCents: 0,
      taxCents: 0,
      totalCents: 0,
    })
  })
})

describe('percent <-> bps', () => {
  it('converts both ways', () => {
    expect(percentToBps(20)).toBe(2000)
    expect(percentToBps(8.25)).toBe(825)
    expect(percentToBps('7.5')).toBe(750)
    expect(bpsToPercent(825)).toBe(8.25)
  })

  it('defaults to 0 on junk rather than NaN', () => {
    expect(percentToBps('abc')).toBe(0)
  })
})
