import { describe, expect, it } from 'vitest'
import {
  addDaysIso,
  daysBetweenIso,
  formatDateHuman,
  isIsoDate,
  isOverdue,
  startOfMonthUtc,
  todayIso,
} from './dates'

describe('isIsoDate', () => {
  it('accepts real calendar dates', () => {
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2024-02-29')).toBe(true) // leap year
  })

  it('rejects malformed and impossible dates', () => {
    expect(isIsoDate('2026-2-8')).toBe(false)
    expect(isIsoDate('not-a-date')).toBe(false)
    expect(isIsoDate('2026-13-01')).toBe(false)
    // JS would roll this over to 2026-03-01; we must not accept it.
    expect(isIsoDate('2026-02-30')).toBe(false)
  })
})

describe('addDaysIso', () => {
  it('adds and subtracts across month boundaries', () => {
    expect(addDaysIso('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('crosses year boundaries', () => {
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('handles leap days', () => {
    expect(addDaysIso('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDaysIso('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('does not shift a date under DST transitions', () => {
    // Anchoring at 12:00 UTC is what protects this. A midnight anchor would
    // slide by a day for anyone west of UTC.
    expect(addDaysIso('2026-03-08', 0)).toBe('2026-03-08')
    expect(addDaysIso('2026-11-01', 0)).toBe('2026-11-01')
  })
})

describe('daysBetweenIso', () => {
  it('counts forwards and backwards', () => {
    expect(daysBetweenIso('2026-09-01', '2026-09-08')).toBe(7)
    expect(daysBetweenIso('2026-09-08', '2026-09-01')).toBe(-7)
    expect(daysBetweenIso('2026-09-01', '2026-09-01')).toBe(0)
  })

  it('is exact across a DST boundary', () => {
    expect(daysBetweenIso('2026-03-07', '2026-03-09')).toBe(2)
  })
})

describe('isOverdue', () => {
  const now = new Date('2026-09-10T08:00:00Z')

  it('is true strictly after the due date', () => {
    expect(isOverdue('2026-09-09', now)).toBe(true)
  })

  it('is false on the due date itself', () => {
    expect(isOverdue('2026-09-10', now)).toBe(false)
  })

  it('is false before the due date', () => {
    expect(isOverdue('2026-09-11', now)).toBe(false)
  })
})

describe('todayIso / startOfMonthUtc', () => {
  it('formats today as YYYY-MM-DD', () => {
    expect(todayIso(new Date('2026-09-10T23:30:00Z'))).toBe('2026-09-10')
  })

  it('finds the first instant of the month for usage counting', () => {
    expect(startOfMonthUtc(new Date('2026-09-17T13:45:00Z')).toISOString()).toBe(
      '2026-09-01T00:00:00.000Z',
    )
  })
})

describe('formatDateHuman', () => {
  it('renders in UTC so the printed date matches the stored one', () => {
    expect(formatDateHuman('2026-09-30')).toBe('Sep 30, 2026')
  })

  it('falls back to the raw value when Intl rejects the locale', () => {
    // An underscore is invalid BCP-47 and throws; 'not-a-locale' would NOT,
    // since 'not' parses as a language subtag.
    expect(formatDateHuman('2026-09-30', 'en_US')).toBe('2026-09-30')
  })
})
