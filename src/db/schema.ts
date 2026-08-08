import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * Money is ALWAYS stored as integer minor units (cents) alongside an ISO-4217
 * currency code. Never floats — see src/lib/money.ts.
 */

export const documentKind = pgEnum('document_kind', [
  'invoice',
  'quote',
  'proposal',
  'receipt',
])

export const documentStatus = pgEnum('document_status', [
  'draft',
  'sent',
  'viewed',
  'partially_paid',
  'paid',
  'overdue',
  'void',
])

export const reminderStatus = pgEnum('reminder_status', [
  'pending',
  'sent',
  'cancelled',
  'failed',
])

export const paymentProvider = pgEnum('payment_provider', ['stripe', 'manual'])

export const planTier = pgEnum('plan_tier', ['free', 'pro'])

export const eventType = pgEnum('event_type', [
  'created',
  'sent',
  'delivered',
  'bounced',
  'complained',
  'email_opened',
  'viewed',
  'pdf_downloaded',
  'payment_started',
  'paid',
  'marked_paid_manually',
  'reminder_sent',
  'reminder_skipped',
  'voided',
  'edited_after_send',
])

// ---------------------------------------------------------------------------
// Users & auth
// ---------------------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Always stored lowercased — see normalizeEmail() in src/lib/email-address.ts
    email: text('email').notNull(),
    name: text('name'),
    businessName: text('business_name'),
    businessAddress: text('business_address'),
    businessEmail: text('business_email'),
    businessPhone: text('business_phone'),
    logoUrl: text('logo_url'),
    accentColor: text('accent_color').notNull().default('#0f172a'),
    themeId: text('theme_id').notNull().default('minimal'),
    nicheSlug: text('niche_slug'),
    defaultCurrency: text('default_currency').notNull().default('USD'),
    defaultPaymentTermsDays: integer('default_payment_terms_days')
      .notNull()
      .default(14),
    defaultTaxRateBps: integer('default_tax_rate_bps').notNull().default(0),
    taxLabel: text('tax_label').notNull().default('Tax'),
    bankDetails: text('bank_details'),
    plan: planTier('plan').notNull().default('free'),
    remindersEnabledByDefault: boolean('reminders_enabled_by_default')
      .notNull()
      .default(true),
    reminderTone: text('reminder_tone').notNull().default('friendly'),
    invoiceNumberFormat: text('invoice_number_format')
      .notNull()
      .default('INV-{YYYY}-{0000}'),
    nextInvoiceNumber: integer('next_invoice_number').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('users_email_unique').on(t.email)],
)

/** Single-use magic-link tokens. Only the SHA-256 hash is stored. */
export const loginTokens = pgTable(
  'login_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull(),
    email: text('email').notNull(),
    // Draft to claim into the account once the link is used.
    claimDraftId: uuid('claim_draft_id'),
    /**
     * The requester's anonymous session id, captured when the link was ASKED
     * FOR rather than read from whoever opens it. People request the link on a
     * laptop and open it on a phone, where no fi_anon cookie exists — binding
     * the claim to the opener's cookie silently loses their draft.
     */
    anonymousSessionId: text('anonymous_session_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('login_tokens_hash_unique').on(t.tokenHash)],
)

/**
 * Shared-store rate limiting. The in-memory limiter in src/lib/rate-limit.ts is
 * per-lambda on Vercel, which caps nothing globally — fine for cheap endpoints,
 * useless for the one that sends email to an arbitrary address.
 */
export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  windowStart: timestamp('window_start', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

/** Sessions. Only the SHA-256 hash of the session token is stored. */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('sessions_hash_unique').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
  ],
)

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email'),
    company: text('company'),
    address: text('address'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('clients_owner_idx').on(t.ownerId),
    uniqueIndex('clients_owner_email_unique').on(t.ownerId, t.email),
  ],
)

// ---------------------------------------------------------------------------
// Documents — invoices today, quotes/proposals without a migration later.
// ---------------------------------------------------------------------------

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    clientId: uuid('client_id').references(() => clients.id, {
      onDelete: 'set null',
    }),
    kind: documentKind('kind').notNull().default('invoice'),
    status: documentStatus('status').notNull().default('draft'),
    number: text('number'),

    // Denormalised recipient, so an invoice survives a client being deleted.
    clientName: text('client_name'),
    clientEmail: text('client_email'),
    clientAddress: text('client_address'),

    currency: text('currency').notNull().default('USD'),
    issueDate: text('issue_date').notNull(),
    dueDate: text('due_date').notNull(),

    subtotalCents: integer('subtotal_cents').notNull().default(0),
    taxRateBps: integer('tax_rate_bps').notNull().default(0),
    taxCents: integer('tax_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull().default(0),
    amountPaidCents: integer('amount_paid_cents').notNull().default(0),

    notes: text('notes'),
    terms: text('terms'),
    taxLabel: text('tax_label').notNull().default('Tax'),

    nicheSlug: text('niche_slug'),
    themeId: text('theme_id').notNull().default('minimal'),
    accentColor: text('accent_color').notNull().default('#0f172a'),

    /** Unguessable public URL segment. 128+ bits — see src/lib/tokens.ts */
    publicToken: text('public_token').notNull(),

    remindersEnabled: boolean('reminders_enabled').notNull().default(true),
    reminderTone: text('reminder_tone').notNull().default('friendly'),

    sentAt: timestamp('sent_at', { withTimezone: true }),
    firstViewedAt: timestamp('first_viewed_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),

    /**
     * Frozen copy of everything the client saw at send time. The public page
     * and the PDF render from this, so a later edit can never silently change
     * an invoice someone has already received.
     */
    snapshot: jsonb('snapshot'),

    /**
     * Business details typed by a visitor who has no account yet. Signed-in
     * users get these from their profile instead; this is copied into the
     * profile when the draft is claimed at signup.
     */
    draftBusiness: jsonb('draft_business'),

    /** Set while the invoice belongs to an anonymous, pre-signup visitor. */
    anonymousSessionId: text('anonymous_session_id'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('documents_public_token_unique').on(t.publicToken),
    index('documents_owner_idx').on(t.ownerId),
    index('documents_anon_idx').on(t.anonymousSessionId),
    // Backs the freemium usage count (owner + kind + sent_at window).
    index('documents_usage_idx').on(t.ownerId, t.kind, t.sentAt),
    index('documents_status_due_idx').on(t.status, t.dueDate),
  ],
)

export const lineItems = pgTable(
  'line_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    description: text('description').notNull().default(''),
    quantity: numeric('quantity', { precision: 12, scale: 3 })
      .notNull()
      .default('1'),
    unit: text('unit'),
    unitPriceCents: integer('unit_price_cents').notNull().default(0),
    taxable: boolean('taxable').notNull().default(true),
    amountCents: integer('amount_cents').notNull().default(0),
  },
  (t) => [index('line_items_document_idx').on(t.documentId)],
)

/** Append-only. Never updated, never deleted. Powers the timeline and metrics. */
export const documentEvents = pgTable(
  'document_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    type: eventType('type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Hashed, never raw — see src/lib/tokens.ts hashIp() */
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    meta: jsonb('meta'),
  },
  (t) => [index('document_events_document_idx').on(t.documentId, t.occurredAt)],
)

export const reminders = pgTable(
  'reminders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    /** Stable key for a rung of the ladder, e.g. "before_3d", "after_7d". */
    ruleKey: text('rule_key').notNull(),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
    status: reminderStatus('status').notNull().default('pending'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    channel: text('channel').notNull().default('email'),
    providerMessageId: text('provider_message_id'),
    error: text('error'),
  },
  (t) => [
    // THE most important constraint in the schema: makes the cron idempotent.
    // A duplicate reminder is a customer-relationship bug, not a cosmetic one.
    uniqueIndex('reminders_document_rule_unique').on(t.documentId, t.ruleKey),
    index('reminders_due_idx').on(t.status, t.scheduledFor),
  ],
)

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    provider: paymentProvider('provider').notNull(),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    stripeCheckoutSessionId: text('stripe_checkout_session_id'),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull(),
    status: text('status').notNull().default('succeeded'),
    method: text('method'),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
    raw: jsonb('raw'),
  },
  (t) => [
    index('payments_document_idx').on(t.documentId),
    uniqueIndex('payments_checkout_session_unique').on(
      t.stripeCheckoutSessionId,
    ),
  ],
)

/** Their Stripe Connect account. We store the account id — never card data. */
export const stripeConnections = pgTable('stripe_connections', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  stripeAccountId: text('stripe_account_id').notNull(),
  chargesEnabled: boolean('charges_enabled').notNull().default(false),
  payoutsEnabled: boolean('payouts_enabled').notNull().default(false),
  detailsSubmitted: boolean('details_submitted').notNull().default(false),
  onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
})

/** Our own subscription revenue. Entirely separate from Connect. */
export const subscriptions = pgTable('subscriptions', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  plan: planTier('plan').notNull().default('free'),
  status: text('status'),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
})

/**
 * Webhook idempotency ledger. Insert-then-process: a duplicate insert means we
 * have already handled this event. Stripe *will* redeliver.
 */
export const webhookEvents = pgTable('webhook_events', {
  provider: text('provider').notNull(),
  eventId: text('event_id').primaryKey(),
  type: text('type'),
  receivedAt: timestamp('received_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
})

export type User = typeof users.$inferSelect
export type Client = typeof clients.$inferSelect
export type Document = typeof documents.$inferSelect
export type LineItem = typeof lineItems.$inferSelect
export type DocumentEvent = typeof documentEvents.$inferSelect
export type Reminder = typeof reminders.$inferSelect
export type Payment = typeof payments.$inferSelect
export type StripeConnection = typeof stripeConnections.$inferSelect
export type Subscription = typeof subscriptions.$inferSelect
