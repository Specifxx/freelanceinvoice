import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { webhookEvents } from '@/db/schema'

/**
 * Stripe *will* redeliver events — on timeouts, on 500s, and sometimes just
 * because. Insert-then-process: if the insert conflicts, another delivery
 * already claimed this event and we skip it.
 *
 * Returns true if this caller owns the event and should process it.
 */
export async function claimWebhookEvent(
  provider: string,
  eventId: string,
  type: string,
): Promise<boolean> {
  const inserted = await db
    .insert(webhookEvents)
    .values({ provider, eventId, type })
    .onConflictDoNothing({ target: webhookEvents.eventId })
    .returning({ eventId: webhookEvents.eventId })

  return inserted.length > 0
}

export async function markWebhookProcessed(eventId: string): Promise<void> {
  await db
    .update(webhookEvents)
    .set({ processedAt: new Date() })
    .where(eq(webhookEvents.eventId, eventId))
}

/**
 * Undoes a claim when the handler failed. Without this, returning 500 to ask
 * Stripe for a retry is useless — the retry would see the claim row and skip
 * the work, so the event would be lost for good.
 */
export async function releaseWebhookEvent(eventId: string): Promise<void> {
  try {
    await db.delete(webhookEvents).where(eq(webhookEvents.eventId, eventId))
  } catch (error) {
    console.error('[webhooks] failed to release event for retry', eventId, error)
  }
}
