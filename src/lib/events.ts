import { desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { documentEvents } from '@/db/schema'
import { hashIp } from './tokens'

export type EventType = (typeof documentEvents.$inferInsert)['type']

/**
 * Append-only. Every question worth asking later — days-to-payment, whether
 * reminders actually move it, view-to-pay conversion — is answered from this
 * table, so it is written from the first week rather than retrofitted.
 *
 * Never throws: a failed audit write must not roll back the user action that
 * triggered it.
 */
export async function recordEvent(input: {
  documentId: string
  type: EventType
  ip?: string | null
  userAgent?: string | null
  meta?: Record<string, unknown>
}): Promise<void> {
  try {
    await db.insert(documentEvents).values({
      documentId: input.documentId,
      type: input.type,
      ipHash: hashIp(input.ip),
      userAgent: input.userAgent?.slice(0, 500) ?? null,
      meta: input.meta ?? null,
    })
  } catch (error) {
    console.error('[events] failed to record', input.type, error)
  }
}

export async function listEvents(documentId: string, limit = 100) {
  return db
    .select()
    .from(documentEvents)
    .where(eq(documentEvents.documentId, documentId))
    .orderBy(desc(documentEvents.occurredAt))
    .limit(limit)
}

/** Extracts the client IP from proxy headers. Vercel sets x-forwarded-for. */
export function clientIpFrom(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null
  return headers.get('x-real-ip')
}

const EVENT_LABELS: Record<string, string> = {
  created: 'Invoice created',
  sent: 'Sent to client',
  delivered: 'Email delivered',
  bounced: 'Email bounced',
  complained: 'Marked as spam',
  email_opened: 'Email opened (unreliable)',
  viewed: 'Client opened the invoice',
  pdf_downloaded: 'PDF downloaded',
  payment_started: 'Client started checkout',
  paid: 'Paid',
  marked_paid_manually: 'Marked paid manually',
  reminder_sent: 'Reminder sent',
  reminder_skipped: 'Reminder skipped',
  voided: 'Voided',
  edited_after_send: 'Edited after sending',
}

export function eventLabel(type: string): string {
  return EVENT_LABELS[type] ?? type
}
