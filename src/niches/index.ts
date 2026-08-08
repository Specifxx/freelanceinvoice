import { cleaning } from './cleaning'
import { design } from './design'
import { photography } from './photography'
import { tutoring } from './tutoring'
import type { Niche } from './types'

export type { Niche, LineItemPreset, NicheFaq } from './types'

/**
 * The registry. Adding a profession is: write a file next to these four, add
 * one line below, redeploy. That produces the landing page at
 * /{slug}-invoice-template, the line-item presets, the default terms and the
 * reminder wording — with no schema change and no code branching.
 */
export const NICHES: readonly Niche[] = [
  photography,
  cleaning,
  tutoring,
  design,
]

const BY_SLUG = new Map(NICHES.map((n) => [n.slug, n]))

export function getNiche(slug: string | null | undefined): Niche | undefined {
  if (!slug) return undefined
  return BY_SLUG.get(slug)
}

export function nicheSlugs(): string[] {
  return NICHES.map((n) => n.slug)
}

/** Neutral fallback for users who never pick a niche. */
export const GENERIC_PRESETS = [
  { description: 'Professional services', unit: 'hour', defaultQuantity: 1, defaultRateCents: 0 },
  { description: 'Consulting', unit: 'day', defaultQuantity: 1, defaultRateCents: 0 },
  { description: 'Project work', unit: 'project', defaultQuantity: 1, defaultRateCents: 0 },
  { description: 'Expenses', unit: 'item', defaultQuantity: 1, defaultRateCents: 0 },
]

export function presetsFor(slug: string | null | undefined) {
  return getNiche(slug)?.lineItemPresets ?? GENERIC_PRESETS
}
