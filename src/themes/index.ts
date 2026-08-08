/**
 * Themes are design tokens, not layouts. The web invoice page and the PDF
 * renderer both consume this object, which is what keeps the two in sync
 * without writing each theme's layout twice.
 *
 * The accent colour is NOT a theme token — it comes from the user, so any
 * brand colour works with any theme.
 */

export type ThemeId = 'minimal' | 'bold' | 'classic'

export type Theme = {
  id: ThemeId
  name: string
  description: string
  tokens: {
    /** Web font stack. */
    fontFamily: string
    /** react-pdf built-in font — no network fetch, no bundled font files. */
    pdfFont: 'Helvetica' | 'Times-Roman' | 'Courier'
    pdfFontBold: 'Helvetica-Bold' | 'Times-Bold' | 'Courier-Bold'
    /** How the accent colour is used in the document header. */
    headerLayout: 'rule' | 'band' | 'plain'
    headingTransform: 'none' | 'uppercase'
    headingLetterSpacing: number
    text: string
    muted: string
    border: string
    tableHeaderBg: string
    radius: number
  }
}

export const THEMES: Record<ThemeId, Theme> = {
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    description: 'Quiet and modern. A thin accent rule, generous whitespace.',
    tokens: {
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      pdfFont: 'Helvetica',
      pdfFontBold: 'Helvetica-Bold',
      headerLayout: 'rule',
      headingTransform: 'none',
      headingLetterSpacing: 0,
      text: '#0f172a',
      muted: '#64748b',
      border: '#e2e8f0',
      tableHeaderBg: '#f8fafc',
      radius: 8,
    },
  },
  bold: {
    id: 'bold',
    name: 'Bold',
    description: 'A solid accent band across the header. Reads as a brand.',
    tokens: {
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      pdfFont: 'Helvetica',
      pdfFontBold: 'Helvetica-Bold',
      headerLayout: 'band',
      headingTransform: 'uppercase',
      headingLetterSpacing: 1.2,
      text: '#111827',
      muted: '#6b7280',
      border: '#e5e7eb',
      tableHeaderBg: '#f3f4f6',
      radius: 4,
    },
  },
  classic: {
    id: 'classic',
    name: 'Classic',
    description: 'Serif and conservative. Suits agency and corporate clients.',
    tokens: {
      fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
      pdfFont: 'Times-Roman',
      pdfFontBold: 'Times-Bold',
      headerLayout: 'plain',
      headingTransform: 'uppercase',
      headingLetterSpacing: 0.8,
      text: '#1f2937',
      muted: '#6b7280',
      border: '#d1d5db',
      tableHeaderBg: '#f9fafb',
      radius: 0,
    },
  },
}

export const THEME_LIST: readonly Theme[] = Object.values(THEMES)

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && value in THEMES
}

export function getTheme(id: string | null | undefined): Theme {
  return isThemeId(id) ? THEMES[id] : THEMES.minimal
}

/** Legible foreground for text sitting on the user's accent colour. */
export function contrastOn(hex: string): '#ffffff' | '#0f172a' {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m?.[1]) return '#ffffff'
  const int = parseInt(m[1], 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255
  // Relative luminance, sRGB coefficients.
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#0f172a' : '#ffffff'
}

export function isValidHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim())
}
