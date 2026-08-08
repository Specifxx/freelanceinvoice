import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * End-to-end lifecycle against a real Postgres. Skipped automatically when
 * DATABASE_URL is unset, so `npm test` stays green without a database.
 *
 *   createdb freelanceinvoice && npm run db:migrate
 *   DATABASE_URL=postgresql://... npm test
 */
const DATABASE_URL = process.env.DATABASE_URL
const describeDb = DATABASE_URL ? describe : describe.skip

describeDb('invoice lifecycle', () => {
  let db: typeof import('@/db').db
  let schema: typeof import('@/db/schema')
  let invoices: typeof import('@/lib/invoices')

  let ownerId: string
  let strangerId: string
  let documentId: string

  beforeAll(async () => {
    ;({ db } = await import('@/db'))
    schema = await import('@/db/schema')
    invoices = await import('@/lib/invoices')

    const [owner] = await db
      .insert(schema.users)
      .values({
        email: `owner-${Date.now()}@test.local`,
        businessName: 'Rowan Studio',
        plan: 'free',
      })
      .returning()
    const [stranger] = await db
      .insert(schema.users)
      .values({ email: `stranger-${Date.now()}@test.local` })
      .returning()

    ownerId = owner!.id
    strangerId = stranger!.id
  })

  afterAll(async () => {
    if (!DATABASE_URL) return
    // Cascades clean up documents, items, events, reminders and payments.
    await db.delete(schema.users).where(eq(schema.users.id, ownerId))
    await db.delete(schema.users).where(eq(schema.users.id, strangerId))
  })

  it('creates a draft with a unique public token', async () => {
    const doc = await invoices.createDraft({ ownerId, nicheSlug: 'photography' })
    documentId = doc.id

    expect(doc.status).toBe('draft')
    expect(doc.publicToken).toBeTruthy()
    // 16 random bytes as base64url.
    expect(doc.publicToken.length).toBeGreaterThanOrEqual(21)
    // Niche defaults applied without any extra wiring.
    expect(doc.themeId).toBe('bold')
    expect(doc.notes).toContain('usage rights')
  })

  it('recomputes totals server-side on save', async () => {
    await invoices.saveDocument(documentId, {
      clientName: 'Acme Ltd',
      clientEmail: 'accounts@acme.test',
      clientAddress: null,
      issueDate: '2026-09-01',
      dueDate: '2026-09-30',
      currency: 'USD',
      taxRateBps: 2000,
      taxLabel: 'VAT',
      notes: null,
      terms: null,
      themeId: 'minimal',
      accentColor: '#0f172a',
      remindersEnabled: true,
      reminderTone: 'friendly',
      items: [
        { description: 'Wedding coverage', quantity: 1, unitPriceCents: 250_000 },
        { description: 'Extra images', quantity: 10, unitPriceCents: 2_500 },
      ],
    })

    const doc = await invoices.getOwnedDocument(documentId, ownerId)
    expect(doc).not.toBeNull()
    expect(doc!.items).toHaveLength(2)
    expect(doc!.subtotalCents).toBe(275_000)
    expect(doc!.taxCents).toBe(55_000)
    expect(doc!.totalCents).toBe(330_000)
    // The invariant that matters on a printed invoice.
    expect(doc!.totalCents).toBe(doc!.subtotalCents + doc!.taxCents)
  })

  it('refuses to load another user\'s invoice', async () => {
    // The classic IDOR for this product shape.
    expect(await invoices.getOwnedDocument(documentId, strangerId)).toBeNull()
  })

  it('assigns sequential invoice numbers under the user\'s format', async () => {
    const first = await invoices.assignInvoiceNumber(ownerId, '2026-09-01')
    const second = await invoices.assignInvoiceNumber(ownerId, '2026-09-01')
    expect(first).toBe('INV-2026-0001')
    expect(second).toBe('INV-2026-0002')
  })

  it('freezes a snapshot on send and schedules the full reminder ladder', async () => {
    const doc = (await invoices.getOwnedDocument(documentId, ownerId))!
    const [owner] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, ownerId))
      .limit(1)

    const snapshot = invoices.buildSnapshot(doc, owner!, 'INV-2026-0003')
    await invoices.markDocumentSent({
      documentId,
      number: 'INV-2026-0003',
      snapshot,
    })

    const count = await invoices.scheduleRemindersFor(
      { ...doc, dueDate: doc.dueDate },
      '2026-09-01',
    )
    expect(count).toBe(5)

    const rows = await db
      .select()
      .from(schema.reminders)
      .where(eq(schema.reminders.documentId, documentId))
    expect(rows).toHaveLength(5)
    expect(rows.every((r) => r.status === 'pending')).toBe(true)
  })

  it('is idempotent when the same invoice is scheduled twice', async () => {
    // Backed by the unique index on (document_id, rule_key). A duplicate
    // reminder is a customer-relationship bug, not a cosmetic one.
    const doc = (await invoices.getOwnedDocument(documentId, ownerId))!
    await invoices.scheduleRemindersFor(doc, '2026-09-01')

    const rows = await db
      .select()
      .from(schema.reminders)
      .where(eq(schema.reminders.documentId, documentId))
    expect(rows).toHaveLength(5)
  })

  it('serves the frozen snapshot after sending, not live data', async () => {
    const doc = (await invoices.getOwnedDocument(documentId, ownerId))!
    // Owner details changed after the fact...
    const snapshot = invoices.snapshotFor(doc, {
      businessName: 'A COMPLETELY DIFFERENT NAME',
      plan: 'free',
    })
    // ...but the client still sees what they were sent.
    expect(snapshot.business.name).toBe('Rowan Studio')
    expect(snapshot.invoice.number).toBe('INV-2026-0003')
  })

  it('records only the first view', async () => {
    expect(await invoices.recordFirstView(documentId)).toBe(true)
    expect(await invoices.recordFirstView(documentId)).toBe(false)

    const doc = (await invoices.getOwnedDocument(documentId, ownerId))!
    expect(doc.firstViewedAt).not.toBeNull()
    expect(invoices.displayStatus(doc, new Date('2026-09-15T00:00:00Z'))).toBe('viewed')
  })

  it('derives overdue from the due date rather than storing it', async () => {
    const doc = (await invoices.getOwnedDocument(documentId, ownerId))!
    expect(invoices.displayStatus(doc, new Date('2026-10-15T00:00:00Z'))).toBe('overdue')
    expect(invoices.displayStatus(doc, new Date('2026-09-15T00:00:00Z'))).toBe('viewed')
  })

  it('counts a sent invoice toward the free monthly allowance', async () => {
    const count = await invoices.countSentThisPeriod(
      ownerId,
      new Date('2000-01-01T00:00:00Z'),
    )
    expect(count).toBe(1)
  })

  it('marks paid, cancels pending reminders, and ignores a redelivery', async () => {
    const first = await invoices.markDocumentPaid({
      documentId,
      amountCents: 330_000,
    })
    expect(first).toBe(true)

    // A Stripe webhook redelivery must not double-record.
    const second = await invoices.markDocumentPaid({
      documentId,
      amountCents: 330_000,
    })
    expect(second).toBe(false)

    const stillPending = await db
      .select()
      .from(schema.reminders)
      .where(
        and(
          eq(schema.reminders.documentId, documentId),
          eq(schema.reminders.status, 'pending'),
        ),
      )
    expect(stillPending).toHaveLength(0)

    const doc = (await invoices.getOwnedDocument(documentId, ownerId))!
    expect(invoices.displayStatus(doc)).toBe('paid')
  })

  it('claims an anonymous draft into an account exactly once', async () => {
    const anonId = 'anon-session-test'
    const draft = await invoices.createDraft({ anonymousSessionId: anonId })

    expect(await invoices.getAnonymousDocument(draft.id, anonId)).not.toBeNull()
    expect(await invoices.getAnonymousDocument(draft.id, 'wrong-session')).toBeNull()

    expect(await invoices.claimDraft(draft.id, ownerId, anonId)).toBe(true)
    // Already owned — a replayed magic link cannot re-claim it.
    expect(await invoices.claimDraft(draft.id, strangerId, anonId)).toBe(false)

    expect(await invoices.getOwnedDocument(draft.id, ownerId)).not.toBeNull()
    expect(await invoices.getOwnedDocument(draft.id, strangerId)).toBeNull()
  })

  it('renders a real PDF from the snapshot', async () => {
    const { renderInvoicePdf } = await import('@/pdf/InvoicePdf')
    const doc = (await invoices.getOwnedDocument(documentId, ownerId))!
    const buffer = await renderInvoicePdf(invoices.snapshotFor(doc, { plan: 'free' }))

    expect(buffer.length).toBeGreaterThan(1000)
    // Every PDF starts with %PDF-.
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
  }, 30_000)
})
