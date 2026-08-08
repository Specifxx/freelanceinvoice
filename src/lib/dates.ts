/**
 * Invoice dates are calendar dates, not instants — "due 14 March" means the
 * same thing in Auckland and Los Angeles. They are stored as 'YYYY-MM-DD'
 * text and anchored to 12:00 UTC when converted, which keeps ±13h timezone
 * offsets and DST from shifting a date by a day.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const d = new Date(`${value}T12:00:00.000Z`)
  return !Number.isNaN(d.getTime()) && toIsoDate(d) === value
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function todayIso(now: Date = new Date()): string {
  return toIsoDate(now)
}

/** Midday UTC on the given calendar date. */
export function isoToDate(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`)
}

export function addDaysIso(iso: string, days: number): string {
  const d = isoToDate(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return toIsoDate(d)
}

/** Whole days from `a` to `b`; negative when `b` is earlier. */
export function daysBetweenIso(a: string, b: string): number {
  const ms = isoToDate(b).getTime() - isoToDate(a).getTime()
  return Math.round(ms / 86_400_000)
}

export function isOverdue(dueDateIso: string, now: Date = new Date()): boolean {
  return daysBetweenIso(todayIso(now), dueDateIso) < 0
}

export function formatDateHuman(iso: string, locale = 'en-US'): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(isoToDate(iso))
  } catch {
    return iso
  }
}

/** First instant of the current calendar month, used for free-tier counting. */
export function startOfMonthUtc(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  )
}
