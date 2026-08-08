import { describe, expect, it } from 'vitest'
import { checkCanSend, getEntitlements, hasFeature } from './entitlements'

describe('getEntitlements', () => {
  it('gives free users the differentiator', () => {
    // Gating reminders would mean free users never feel the thing we sell.
    const free = getEntitlements('free')
    expect(free.automaticReminders).toBe(true)
    expect(free.monthlySendLimit).toBe(3)
    expect(free.showsOurBranding).toBe(true)
  })

  it('gives pro unlimited sending and no branding', () => {
    const pro = getEntitlements('pro')
    expect(pro.monthlySendLimit).toBeNull()
    expect(pro.showsOurBranding).toBe(false)
    expect(pro.recurringInvoices).toBe(true)
  })

  it('treats unknown, null and undefined plans as free', () => {
    expect(getEntitlements(null).plan).toBe('free')
    expect(getEntitlements(undefined).plan).toBe('free')
  })
})

describe('checkCanSend', () => {
  it('allows a free user under the limit and reports what is left', () => {
    const check = checkCanSend('free', 1)
    expect(check.allowed).toBe(true)
    expect(check.remaining).toBe(2)
  })

  it('blocks a free user at the limit with a reason to show them', () => {
    const check = checkCanSend('free', 3)
    expect(check.allowed).toBe(false)
    if (!check.allowed) {
      expect(check.reason).toContain('3')
      expect(check.remaining).toBe(0)
    }
  })

  it('blocks past the limit too, not just exactly at it', () => {
    expect(checkCanSend('free', 99).allowed).toBe(false)
  })

  it('never blocks pro, however many have been sent', () => {
    const check = checkCanSend('pro', 10_000)
    expect(check.allowed).toBe(true)
    expect(check.remaining).toBeNull()
  })

  it('allows the very first send on a fresh free account', () => {
    expect(checkCanSend('free', 0).allowed).toBe(true)
  })
})

describe('hasFeature', () => {
  it('gates paid features', () => {
    expect(hasFeature('free', 'recurringInvoices')).toBe(false)
    expect(hasFeature('pro', 'recurringInvoices')).toBe(true)
    expect(hasFeature('free', 'clientManagement')).toBe(false)
    expect(hasFeature('free', 'customReminderSchedules')).toBe(false)
  })

  it('leaves reminders open to everyone', () => {
    expect(hasFeature('free', 'automaticReminders')).toBe(true)
  })

  it('inverts showsOurBranding — having the feature means branding is removed', () => {
    expect(hasFeature('free', 'showsOurBranding')).toBe(false)
    expect(hasFeature('pro', 'showsOurBranding')).toBe(true)
  })
})
