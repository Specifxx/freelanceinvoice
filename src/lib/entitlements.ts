/**
 * The single source of truth for what a plan may do.
 *
 * Every gate in the app calls into this module — never an inline `plan ===
 * 'pro'` check in a route handler, and never a check that exists only in the
 * UI. Components read the same object to render lock badges, but the server
 * always re-checks before acting.
 */

export type PlanTier = 'free' | 'pro'

export type Entitlements = {
  plan: PlanTier
  /** null means unlimited. */
  monthlySendLimit: number | null
  showsOurBranding: boolean
  automaticReminders: boolean
  customReminderSchedules: boolean
  recurringInvoices: boolean
  clientManagement: boolean
  csvExport: boolean
}

export const PRICING = {
  currency: 'USD',
  monthly: 12,
  annual: 99,
} as const

const FREE: Entitlements = {
  plan: 'free',
  monthlySendLimit: 3,
  showsOurBranding: true,
  // Deliberate: the free tier KEEPS the differentiator. Someone who never
  // feels an invoice get paid without a chase has no reason to upgrade.
  automaticReminders: true,
  customReminderSchedules: false,
  recurringInvoices: false,
  clientManagement: false,
  csvExport: false,
}

const PRO: Entitlements = {
  plan: 'pro',
  monthlySendLimit: null,
  showsOurBranding: false,
  automaticReminders: true,
  customReminderSchedules: true,
  recurringInvoices: true,
  clientManagement: true,
  csvExport: true,
}

export function getEntitlements(plan: PlanTier | null | undefined): Entitlements {
  return plan === 'pro' ? PRO : FREE
}

export type SendCheck =
  | { allowed: true; limit: number | null; used: number; remaining: number | null }
  | { allowed: false; limit: number; used: number; remaining: 0; reason: string }

/**
 * Usage is counted on SEND, never on create — drafting has to stay free and
 * unlimited or the "first invoice in 60 seconds" promise dies at the paywall.
 */
export function checkCanSend(
  plan: PlanTier | null | undefined,
  sentThisPeriod: number,
): SendCheck {
  const ent = getEntitlements(plan)
  if (ent.monthlySendLimit === null) {
    return { allowed: true, limit: null, used: sentThisPeriod, remaining: null }
  }
  if (sentThisPeriod < ent.monthlySendLimit) {
    return {
      allowed: true,
      limit: ent.monthlySendLimit,
      used: sentThisPeriod,
      remaining: ent.monthlySendLimit - sentThisPeriod,
    }
  }
  return {
    allowed: false,
    limit: ent.monthlySendLimit,
    used: sentThisPeriod,
    remaining: 0,
    reason: `The free plan covers ${ent.monthlySendLimit} sent invoices a month. Upgrade for unlimited sending.`,
  }
}

export type Feature = Exclude<keyof Entitlements, 'plan' | 'monthlySendLimit'>

export function hasFeature(
  plan: PlanTier | null | undefined,
  feature: Feature,
): boolean {
  const value = getEntitlements(plan)[feature]
  // showsOurBranding is the one inverted flag: having it is the free tier.
  return feature === 'showsOurBranding' ? !value : Boolean(value)
}
