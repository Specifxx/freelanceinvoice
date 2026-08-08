import { isoToDate } from './dates'

/**
 * Renders an invoice number from a user-editable pattern.
 *
 * Supported tokens: {YYYY} {YY} {MM} {DD} and a run of zeros ({0000}) that
 * sets the zero-padding width of the sequence.
 */
export function formatInvoiceNumber(
  format: string,
  sequence: number,
  onDateIso?: string,
): string {
  const date = onDateIso ? isoToDate(onDateIso) : new Date()
  const yyyy = String(date.getUTCFullYear())
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')

  let out = format
    .replace(/\{YYYY\}/g, yyyy)
    .replace(/\{YY\}/g, yyyy.slice(-2))
    .replace(/\{MM\}/g, mm)
    .replace(/\{DD\}/g, dd)

  const padMatch = out.match(/\{(0+)\}/)
  if (padMatch?.[1]) {
    out = out.replace(padMatch[0], String(sequence).padStart(padMatch[1].length, '0'))
  } else {
    // No sequence token in the pattern — append one so numbers stay unique.
    out = `${out}${out.endsWith('-') ? '' : '-'}${sequence}`
  }

  return out
}

export const DEFAULT_NUMBER_FORMAT = 'INV-{YYYY}-{0000}'
