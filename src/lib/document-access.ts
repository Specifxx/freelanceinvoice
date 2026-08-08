import { getAnonymousSessionId } from './anon'
import { getCurrentUser } from './auth'
import {
  getAnonymousDocument,
  getOwnedDocument,
  type DocumentWithItems,
} from './invoices'
import type { User } from '@/db/schema'

export type DocumentActor =
  | { mode: 'owner'; user: User; doc: DocumentWithItems }
  | { mode: 'anonymous'; user: null; doc: DocumentWithItems }

/**
 * Resolves who is asking and whether they may touch this document, in one
 * place. Routes call this instead of assembling their own ownership checks —
 * a forgotten owner comparison in one handler is all it takes to leak every
 * invoice in the system.
 *
 * Returns null for "not found or not yours", deliberately without
 * distinguishing the two: a 404 for someone else's invoice reveals nothing
 * about whether that id exists.
 */
export async function resolveDocumentActor(
  documentId: string,
): Promise<DocumentActor | null> {
  const user = await getCurrentUser()

  if (user) {
    const doc = await getOwnedDocument(documentId, user.id)
    if (doc) return { mode: 'owner', user, doc }
    // Fall through: a signed-in user may still be finishing a draft they
    // started before logging in, in another tab.
  }

  const anonId = await getAnonymousSessionId()
  if (anonId) {
    const doc = await getAnonymousDocument(documentId, anonId)
    if (doc) return { mode: 'anonymous', user: null, doc }
  }

  return null
}

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status })
}
