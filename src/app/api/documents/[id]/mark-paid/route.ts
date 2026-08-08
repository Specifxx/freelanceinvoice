import { db } from '@/db'
import { payments } from '@/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { jsonError } from '@/lib/document-access'
import { recordEvent } from '@/lib/events'
import { getOwnedDocument, markDocumentPaid } from '@/lib/invoices'

export const runtime = 'nodejs'

/**
 * Bank transfer, cash, cheque — the fallback that makes the app useful before
 * Stripe onboarding is finished, which is the single biggest activation cliff.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params

  const user = await getCurrentUser()
  if (!user) return jsonError('Sign in first.', 401)

  const doc = await getOwnedDocument(id, user.id)
  if (!doc) return jsonError('Not found', 404)
  if (doc.paidAt) return jsonError('Already marked as paid.', 409)

  await db.insert(payments).values({
    documentId: doc.id,
    provider: 'manual',
    amountCents: doc.totalCents,
    currency: doc.currency,
    status: 'succeeded',
    method: 'manual',
  })

  const changed = await markDocumentPaid({
    documentId: doc.id,
    amountCents: doc.totalCents,
  })

  if (changed) {
    await recordEvent({
      documentId: doc.id,
      type: 'marked_paid_manually',
      meta: { amountCents: doc.totalCents, by: user.id },
    })
  }

  return Response.json({ ok: true })
}
