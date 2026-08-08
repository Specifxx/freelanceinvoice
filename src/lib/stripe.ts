import Stripe from 'stripe'

/**
 * Two entirely separate Stripe surfaces. Conflating them is the easiest
 * expensive mistake in this codebase:
 *
 *   CONNECT  — the freelancer's client pays the freelancer. Charges are
 *              created *on the connected account* (direct charges), so funds
 *              land in their balance and never touch ours. Disputes, refunds,
 *              payouts and KYC are theirs and Stripe's.
 *
 *   BILLING  — our own subscription revenue, on our platform account.
 *
 * They have different webhook endpoints and different signing secrets.
 *
 * We take no application fee: we monetise by subscription, which keeps our
 * pricing legible and avoids competing with Stripe's own cut.
 */

let stripe: Stripe | null = null

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  stripe ??= new Stripe(key)
  return stripe
}

/** Throws where Stripe is genuinely required, so failures are loud. */
export function requireStripe(): Stripe {
  const client = getStripe()
  if (!client) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set. Payments are disabled until it is configured.',
    )
  }
  return client
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

/**
 * Stripe rejects zero-decimal currencies given fractional amounts. Our cents
 * are already in the right unit for both cases — see src/lib/money.ts.
 */
export function toStripeAmount(cents: number): number {
  return Math.max(0, Math.round(cents))
}

// ---------------------------------------------------------------------------
// Connect — onboarding
// ---------------------------------------------------------------------------

/**
 * Hosted onboarding rather than OAuth. Stripe collects KYC on their own
 * screens, which keeps us out of scope for identity data entirely.
 *
 * NOTE: Stripe now steers new platforms toward the Accounts V2 API
 * (`/v2/core/accounts`). Everything Connect-related is funnelled through this
 * module precisely so that migration is a change here, not across the app.
 */
export async function createConnectAccount(email: string): Promise<string> {
  const client = requireStripe()
  const account = await client.accounts.create({
    type: 'standard',
    email,
  })
  return account.id
}

export async function createAccountLink(options: {
  accountId: string
  refreshUrl: string
  returnUrl: string
}): Promise<string> {
  const client = requireStripe()
  const link = await client.accountLinks.create({
    account: options.accountId,
    refresh_url: options.refreshUrl,
    return_url: options.returnUrl,
    type: 'account_onboarding',
  })
  return link.url
}

export async function fetchAccountStatus(accountId: string): Promise<{
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
}> {
  const client = requireStripe()
  const account = await client.accounts.retrieve(accountId)
  return {
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
  }
}

// ---------------------------------------------------------------------------
// Connect — taking payment for an invoice
// ---------------------------------------------------------------------------

/**
 * A direct charge on the connected account. The `stripeAccount` request option
 * is what makes the money land in the freelancer's balance rather than ours.
 */
export async function createInvoiceCheckoutSession(options: {
  connectedAccountId: string
  documentId: string
  invoiceNumber: string
  amountCents: number
  currency: string
  clientEmail?: string | null
  successUrl: string
  cancelUrl: string
}): Promise<string> {
  const client = requireStripe()

  const session = await client.checkout.sessions.create(
    {
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: options.currency.toLowerCase(),
            unit_amount: toStripeAmount(options.amountCents),
            product_data: { name: `Invoice ${options.invoiceNumber}` },
          },
        },
      ],
      // The webhook matches on this, so it must always be set.
      metadata: { document_id: options.documentId },
      payment_intent_data: {
        metadata: { document_id: options.documentId },
      },
      ...(options.clientEmail ? { customer_email: options.clientEmail } : {}),
      success_url: options.successUrl,
      cancel_url: options.cancelUrl,
    },
    { stripeAccount: options.connectedAccountId },
  )

  if (!session.url) throw new Error('Stripe did not return a checkout URL')
  return session.url
}

// ---------------------------------------------------------------------------
// Billing — our own subscription
// ---------------------------------------------------------------------------

export async function createSubscriptionCheckoutSession(options: {
  userId: string
  email: string
  priceId: string
  existingCustomerId?: string | null
  successUrl: string
  cancelUrl: string
}): Promise<string> {
  const client = requireStripe()

  const session = await client.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: options.priceId, quantity: 1 }],
    ...(options.existingCustomerId
      ? { customer: options.existingCustomerId }
      : { customer_email: options.email }),
    client_reference_id: options.userId,
    metadata: { user_id: options.userId },
    subscription_data: { metadata: { user_id: options.userId } },
    success_url: options.successUrl,
    cancel_url: options.cancelUrl,
  })

  if (!session.url) throw new Error('Stripe did not return a checkout URL')
  return session.url
}

/** Stripe's hosted portal — self-serve cancel/update with no UI of our own. */
export async function createBillingPortalSession(options: {
  customerId: string
  returnUrl: string
}): Promise<string> {
  const client = requireStripe()
  const session = await client.billingPortal.sessions.create({
    customer: options.customerId,
    return_url: options.returnUrl,
  })
  return session.url
}
