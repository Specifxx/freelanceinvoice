import { and, count, desc, eq, gte, isNull, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  documents,
  lineItems,
  reminders,
  users,
  type Document,
  type LineItem,
  type User,
} from '@/db/schema'
import { getNiche } from '@/niches'
import { addDaysIso, isOverdue, todayIso } from './dates'
import { formatMoney } from './money'
import { formatInvoiceNumber } from './numbering'
import { computeReminderSchedule, isReminderTone } from './reminders'
import {
  buildSnapshotFromParts,
  isInvoiceSnapshot as isSnapshot,
  type InvoiceSnapshot,
} from './snapshot'
import { newPublicToken } from './tokens'
import { computeTotals } from './totals'
import { startOfMonthUtc } from './dates'

export type DocumentWithItems = Document & { items: LineItem[] }

// ---------------------------------------------------------------------------
// Reads — every one scoped by ownership
// ---------------------------------------------------------------------------

async function attachItems(doc: Document): Promise<DocumentWithItems> {
  const items = await db
    .select()
    .from(lineItems)
    .where(eq(lineItems.documentId, doc.id))
    .orderBy(lineItems.position)
  return { ...doc, items }
}

/**
 * The ONLY way application code loads someone's invoice. Ownership is part of
 * the WHERE clause, not a check afterwards — an ad-hoc `where(eq(id, id))`
 * plus a forgotten owner comparison is exactly how this product shape leaks
 * every customer's invoices.
 */
export async function getOwnedDocument(
  documentId: string,
  ownerId: string,
): Promise<DocumentWithItems | null> {
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.ownerId, ownerId)))
    .limit(1)
  return doc ? attachItems(doc) : null
}

/** An unclaimed draft belonging to a pre-signup visitor. */
export async function getAnonymousDocument(
  documentId: string,
  anonymousSessionId: string,
): Promise<DocumentWithItems | null> {
  const [doc] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.anonymousSessionId, anonymousSessionId),
        isNull(documents.ownerId),
      ),
    )
    .limit(1)
  return doc ? attachItems(doc) : null
}

export async function getDocumentByToken(
  token: string,
): Promise<DocumentWithItems | null> {
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.publicToken, token))
    .limit(1)
  return doc ? attachItems(doc) : null
}

/**
 * Unscoped lookup with the owner attached. For webhooks and cron only, where
 * there is no session to scope by — never reachable from a user request.
 */
export async function getOwnedDocumentById(
  documentId: string,
): Promise<{ doc: Document; owner: User | null } | null> {
  const [row] = await db
    .select({ doc: documents, owner: users })
    .from(documents)
    .leftJoin(users, eq(users.id, documents.ownerId))
    .where(eq(documents.id, documentId))
    .limit(1)
  return row ? { doc: row.doc, owner: row.owner } : null
}

export async function listOwnedInvoices(ownerId: string): Promise<Document[]> {
  return db
    .select()
    .from(documents)
    .where(and(eq(documents.ownerId, ownerId), eq(documents.kind, 'invoice')))
    .orderBy(desc(documents.createdAt))
    .limit(200)
}

/**
 * Freemium usage. Counted by query rather than a maintained counter, which
 * cannot drift out of sync. Backed by documents_usage_idx.
 */
export async function countSentThisPeriod(
  ownerId: string,
  periodStart: Date = startOfMonthUtc(),
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(documents)
    .where(
      and(
        eq(documents.ownerId, ownerId),
        eq(documents.kind, 'invoice'),
        gte(documents.sentAt, periodStart),
      ),
    )
  return row?.value ?? 0
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type DraftInput = {
  ownerId?: string | null
  anonymousSessionId?: string | null
  nicheSlug?: string | null
  currency?: string
  paymentTermsDays?: number
}

export async function createDraft(input: DraftInput): Promise<Document> {
  const niche = getNiche(input.nicheSlug)
  const issueDate = todayIso()
  const termsDays =
    input.paymentTermsDays ?? niche?.defaults.paymentTermsDays ?? 14

  const [doc] = await db
    .insert(documents)
    .values({
      ownerId: input.ownerId ?? null,
      anonymousSessionId: input.anonymousSessionId ?? null,
      kind: 'invoice',
      status: 'draft',
      currency: input.currency ?? 'USD',
      issueDate,
      dueDate: addDaysIso(issueDate, termsDays),
      nicheSlug: input.nicheSlug ?? null,
      themeId: niche?.defaults.themeId ?? 'minimal',
      taxLabel: niche?.defaults.taxLabel ?? 'Tax',
      notes: niche?.defaults.notes ?? null,
      publicToken: newPublicToken(),
    })
    .returning()

  if (!doc) throw new Error('Failed to create draft')
  return doc
}

export type LineItemInput = {
  description: string
  quantity: string | number
  unit?: string | null
  unitPriceCents: number
  taxable?: boolean
}

export type SaveDocumentInput = {
  clientName?: string | null
  clientEmail?: string | null
  clientAddress?: string | null
  issueDate: string
  dueDate: string
  currency: string
  taxRateBps: number
  taxLabel: string
  notes?: string | null
  terms?: string | null
  themeId: string
  accentColor: string
  remindersEnabled: boolean
  reminderTone: string
  items: LineItemInput[]
}

/**
 * Replaces line items wholesale and recomputes totals server-side. Totals are
 * never trusted from the client — the browser sends quantities and rates, and
 * we do the arithmetic.
 */
export async function saveDocument(
  documentId: string,
  input: SaveDocumentInput,
): Promise<void> {
  const totals = computeTotals(
    input.items.map((i) => ({
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      taxable: i.taxable,
    })),
    input.taxRateBps,
  )

  await db.transaction(async (tx) => {
    await tx
      .update(documents)
      .set({
        clientName: input.clientName ?? null,
        clientEmail: input.clientEmail?.trim().toLowerCase() || null,
        clientAddress: input.clientAddress ?? null,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        currency: input.currency,
        taxRateBps: input.taxRateBps,
        taxLabel: input.taxLabel,
        notes: input.notes ?? null,
        terms: input.terms ?? null,
        themeId: input.themeId,
        accentColor: input.accentColor,
        remindersEnabled: input.remindersEnabled,
        reminderTone: isReminderTone(input.reminderTone)
          ? input.reminderTone
          : 'friendly',
        subtotalCents: totals.subtotalCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId))

    await tx.delete(lineItems).where(eq(lineItems.documentId, documentId))

    if (input.items.length > 0) {
      await tx.insert(lineItems).values(
        input.items.map((item, index) => ({
          documentId,
          position: index,
          description: item.description,
          quantity: String(item.quantity),
          unit: item.unit ?? null,
          unitPriceCents: item.unitPriceCents,
          taxable: item.taxable !== false,
          amountCents: computeTotals(
            [{ quantity: item.quantity, unitPriceCents: item.unitPriceCents }],
            0,
          ).subtotalCents,
        })),
      )
    }
  })
}

/** Moves an anonymous draft into a real account at signup. */
export async function claimDraft(
  documentId: string,
  ownerId: string,
  anonymousSessionId: string,
): Promise<boolean> {
  const rows = await db
    .update(documents)
    .set({ ownerId, anonymousSessionId: null, updatedAt: new Date() })
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.anonymousSessionId, anonymousSessionId),
        isNull(documents.ownerId),
      ),
    )
    .returning({ id: documents.id })
  return rows.length > 0
}

// ---------------------------------------------------------------------------
// Snapshot — what the client saw, frozen
// ---------------------------------------------------------------------------

export type { InvoiceSnapshot } from './snapshot'
export { isInvoiceSnapshot } from './snapshot'

/**
 * Structural rather than `Pick<User, …>`: an anonymous invoice has no user
 * row, so every field has to be nullable. Tying this to the table would make
 * `email: string` mandatory and force callers to invent one.
 */
export type SnapshotOwner = {
  businessName?: string | null
  name?: string | null
  businessAddress?: string | null
  businessEmail?: string | null
  email?: string | null
  businessPhone?: string | null
  logoUrl?: string | null
  bankDetails?: string | null
  plan?: 'free' | 'pro' | null
}

/**
 * Used for both live preview and the frozen copy written at send time, so what
 * a user previews is byte-for-byte what their client receives.
 */
export function buildSnapshot(
  doc: DocumentWithItems,
  owner: SnapshotOwner | null,
  numberOverride?: string,
): InvoiceSnapshot {
  return buildSnapshotFromParts({
    business: {
      name: owner?.businessName || owner?.name || 'Your business',
      address: owner?.businessAddress ?? null,
      email: owner?.businessEmail || owner?.email || null,
      phone: owner?.businessPhone ?? null,
      logoUrl: owner?.logoUrl ?? null,
    },
    client: {
      name: doc.clientName,
      email: doc.clientEmail,
      address: doc.clientAddress,
    },
    invoice: {
      number: numberOverride ?? doc.number ?? 'DRAFT',
      issueDate: doc.issueDate,
      dueDate: doc.dueDate,
      currency: doc.currency,
      notes: doc.notes,
      terms: doc.terms,
      taxLabel: doc.taxLabel,
      taxRateBps: doc.taxRateBps,
      bankDetails: owner?.bankDetails ?? null,
    },
    items: doc.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPriceCents: item.unitPriceCents,
      taxable: item.taxable,
    })),
    theme: { themeId: doc.themeId, accentColor: doc.accentColor },
    showsOurBranding: owner?.plan !== 'pro',
  })
}

/**
 * The frozen copy once sent, a live one before that. This is the guarantee
 * that editing an invoice cannot change what a client already received.
 */
export function snapshotFor(
  doc: DocumentWithItems,
  owner: SnapshotOwner | null,
): InvoiceSnapshot {
  if (doc.sentAt && isSnapshot(doc.snapshot)) return doc.snapshot
  return buildSnapshot(doc, owner)
}

// ---------------------------------------------------------------------------
// Numbering
// ---------------------------------------------------------------------------

/**
 * Row-locks the user before reading the counter, so two invoices sent at the
 * same moment cannot take the same number.
 */
export async function assignInvoiceNumber(
  ownerId: string,
  issueDate: string,
): Promise<string> {
  return db.transaction(async (tx) => {
    const [owner] = await tx
      .select()
      .from(users)
      .where(eq(users.id, ownerId))
      .for('update')
      .limit(1)

    if (!owner) throw new Error('Owner not found')

    const sequence = owner.nextInvoiceNumber
    await tx
      .update(users)
      .set({ nextInvoiceNumber: sequence + 1 })
      .where(eq(users.id, ownerId))

    return formatInvoiceNumber(owner.invoiceNumberFormat, sequence, issueDate)
  })
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type DisplayStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'overdue'
  | 'paid'
  | 'void'

/**
 * Overdue is DERIVED, never stored. A stored overdue flag needs a job to flip
 * it and is wrong for up to a day; deriving it is always correct and costs
 * nothing.
 */
export function displayStatus(
  doc: Pick<Document, 'status' | 'dueDate' | 'paidAt' | 'firstViewedAt' | 'sentAt'>,
  now: Date = new Date(),
): DisplayStatus {
  if (doc.status === 'void') return 'void'
  if (doc.paidAt || doc.status === 'paid') return 'paid'
  if (!doc.sentAt) return 'draft'
  if (isOverdue(doc.dueDate, now)) return 'overdue'
  if (doc.firstViewedAt) return 'viewed'
  return 'sent'
}

export const STATUS_STYLES: Record<DisplayStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 ring-slate-200',
  sent: 'bg-blue-50 text-blue-700 ring-blue-200',
  viewed: 'bg-violet-50 text-violet-700 ring-violet-200',
  overdue: 'bg-red-50 text-red-700 ring-red-200',
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  void: 'bg-slate-100 text-slate-400 ring-slate-200',
}

export const STATUS_LABELS: Record<DisplayStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed',
  overdue: 'Overdue',
  paid: 'Paid',
  void: 'Void',
}

// ---------------------------------------------------------------------------
// Payment state
// ---------------------------------------------------------------------------

/**
 * Idempotent: the WHERE clause excludes already-paid rows, so a Stripe webhook
 * redelivery cannot double-record a payment or re-cancel reminders.
 */
export async function markDocumentPaid(options: {
  documentId: string
  amountCents: number
  paidAt?: Date
}): Promise<boolean> {
  const paidAt = options.paidAt ?? new Date()

  const updated = await db
    .update(documents)
    .set({
      status: 'paid',
      paidAt,
      amountPaidCents: options.amountCents,
      updatedAt: new Date(),
    })
    .where(and(eq(documents.id, options.documentId), isNull(documents.paidAt)))
    .returning({ id: documents.id })

  if (updated.length === 0) return false

  // Stop the chase the instant money lands.
  await db
    .update(reminders)
    .set({ status: 'cancelled' })
    .where(
      and(
        eq(reminders.documentId, options.documentId),
        eq(reminders.status, 'pending'),
      ),
    )

  return true
}

export async function scheduleRemindersFor(
  doc: Document,
  sentOn: string,
): Promise<number> {
  if (!doc.remindersEnabled) return 0

  const schedule = computeReminderSchedule({ dueDate: doc.dueDate, sentOn })
  if (schedule.length === 0) return 0

  await db
    .insert(reminders)
    .values(
      schedule.map((item) => ({
        documentId: doc.id,
        ruleKey: item.ruleKey,
        scheduledFor: item.scheduledFor,
        status: 'pending' as const,
      })),
    )
    // The unique index on (document_id, rule_key) makes re-sending an invoice
    // a no-op for rungs already scheduled, rather than a duplicate reminder.
    .onConflictDoNothing()

  return schedule.length
}

export async function markDocumentSent(options: {
  documentId: string
  number: string
  snapshot: InvoiceSnapshot
  sentAt?: Date
}): Promise<void> {
  await db
    .update(documents)
    .set({
      status: 'sent',
      number: options.number,
      snapshot: options.snapshot,
      sentAt: options.sentAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(documents.id, options.documentId))
}

/**
 * Records the first view. `first_viewed_at IS NULL` in the WHERE means only
 * the first hit writes, so refreshes don't churn the row.
 */
export async function recordFirstView(documentId: string): Promise<boolean> {
  const rows = await db
    .update(documents)
    .set({
      firstViewedAt: new Date(),
      status: sql`CASE WHEN ${documents.status} = 'sent' THEN 'viewed' ELSE ${documents.status} END`,
    })
    .where(
      and(eq(documents.id, documentId), isNull(documents.firstViewedAt)),
    )
    .returning({ id: documents.id })
  return rows.length > 0
}

export function formatDocumentTotal(doc: Pick<Document, 'totalCents' | 'currency'>) {
  return formatMoney(doc.totalCents, doc.currency)
}
