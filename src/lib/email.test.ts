import { afterEach, describe, expect, it } from 'vitest'
import { appUrl, escapeHtml } from './email'

const KEYS = ['APP_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_URL'] as const

afterEach(() => {
  for (const key of KEYS) delete process.env[key]
})

describe('appUrl', () => {
  it('prefers APP_URL when set', () => {
    process.env.APP_URL = 'https://invoices.example.com'
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'wrong.vercel.app'
    expect(appUrl()).toBe('https://invoices.example.com')
  })

  it('strips a trailing slash, which otherwise doubles up in every link', () => {
    process.env.APP_URL = 'https://invoices.example.com/'
    expect(appUrl()).toBe('https://invoices.example.com')
  })

  it('ignores an empty or whitespace APP_URL rather than emitting ""', () => {
    process.env.APP_URL = '   '
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'app.vercel.app'
    expect(appUrl()).toBe('https://app.vercel.app')
  })

  it("falls back to Vercel's stable production domain", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'freelanceinvoice.vercel.app'
    expect(appUrl()).toBe('https://freelanceinvoice.vercel.app')
  })

  it('prefers the production domain over the per-deployment URL', () => {
    // The per-deployment URL changes on every push — a client must never
    // receive a payment link pointing at a deployment that will be superseded.
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'stable.vercel.app'
    process.env.VERCEL_URL = 'abc123-xyz.vercel.app'
    expect(appUrl()).toBe('https://stable.vercel.app')
  })

  it('uses the per-deployment URL only as a last resort', () => {
    process.env.VERCEL_URL = 'abc123-xyz.vercel.app'
    expect(appUrl()).toBe('https://abc123-xyz.vercel.app')
  })

  it('falls back to localhost off-platform', () => {
    expect(appUrl()).toBe('http://localhost:3000')
  })
})

describe('escapeHtml', () => {
  it('neutralises markup in user-supplied text', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    )
  })

  it('escapes ampersands first so entities are not double-broken', () => {
    expect(escapeHtml('Bram & Co <b>')).toBe('Bram &amp; Co &lt;b&gt;')
  })
})
