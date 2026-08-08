import type { ReminderTone } from '@/lib/reminders'
import type { ThemeId } from '@/themes'

export type LineItemPreset = {
  description: string
  unit: string
  defaultQuantity: number
  /** Suggested rate in minor units. 0 means "no sensible default". */
  defaultRateCents: number
}

export type NicheFaq = { q: string; a: string }

/**
 * A niche is *what the app says and defaults to*. A theme is *what it looks
 * like*. They are deliberately orthogonal: a niche names a default theme, but
 * any user in any niche can pick any theme.
 *
 * Adding a profession = add one file here + one line in ./index.ts. No schema
 * change, no new route, no branching in application code.
 */
export type Niche = {
  slug: string
  /** Used in body copy: "invoicing software for {name}". */
  name: string
  /** Shown in the niche picker. */
  label: string
  seo: {
    title: string
    h1: string
    metaDescription: string
    intro: string
    faq: NicheFaq[]
  }
  defaults: {
    unitLabel: string
    paymentTermsDays: number
    taxLabel: string
    notes: string
    themeId: ThemeId
  }
  lineItemPresets: LineItemPreset[]
  /** Optional per-rung wording overrides, keyed by rule key then tone. */
  reminderCopy?: Partial<
    Record<string, Partial<Record<ReminderTone, { subject?: string; body?: string }>>>
  >
}
