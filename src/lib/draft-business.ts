export type DraftBusiness = { name: string; email: string; address: string }

/**
 * Business details typed by a visitor with no account yet, stored on the
 * document as free-form JSON. Parsed defensively — it is user input that has
 * round-tripped through jsonb.
 */
export function draftBusinessOf(value: unknown): DraftBusiness | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  return {
    name: typeof v.name === 'string' ? v.name : '',
    email: typeof v.email === 'string' ? v.email : '',
    address: typeof v.address === 'string' ? v.address : '',
  }
}
