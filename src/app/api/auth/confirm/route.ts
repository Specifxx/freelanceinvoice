import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { documents, users } from '@/db/schema'
import { clearAnonymousSessionId, getAnonymousSessionId } from '@/lib/anon'
import { consumeLoginToken, createSession, findOrCreateUser } from '@/lib/auth'
import { draftBusinessOf } from '@/lib/draft-business'
import { claimDraft } from '@/lib/invoices'

export const runtime = 'nodejs'

/**
 * The real sign-in. POST-only so link scanners cannot trigger it.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  const token = form?.get('token')
  if (typeof token !== 'string' || !token) redirect('/login?error=missing')

  const consumed = await consumeLoginToken(token)
  if (!consumed) redirect('/login?error=expired')

  const user = await findOrCreateUser(consumed.email)
  await createSession(user.id)

  if (!consumed.claimDraftId) redirect('/invoices')

  /**
   * Claim using the anon id recorded when the link was REQUESTED, falling back
   * to this device's cookie. Reading only the opener's cookie is what broke
   * the laptop-to-phone path: no cookie there, so the draft was silently
   * orphaned right at the moment of conversion.
   */
  const anonId =
    consumed.anonymousSessionId ?? (await getAnonymousSessionId())

  if (!anonId) redirect('/invoices?claim=failed')

  const [draft] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, consumed.claimDraftId))
    .limit(1)

  const claimed = await claimDraft(consumed.claimDraftId, user.id, anonId)
  if (!claimed) {
    // Already claimed by this same user on another device — send them to it
    // rather than reporting a failure.
    if (draft?.ownerId === user.id) {
      redirect(`/invoices/${consumed.claimDraftId}/edit?claimed=1`)
    }
    redirect('/invoices?claim=failed')
  }

  await adoptDraftBusiness(user.id, draft?.draftBusiness)
  await clearAnonymousSessionId()

  redirect(`/invoices/${consumed.claimDraftId}/edit?claimed=1`)
}

/**
 * Only fills gaps — never overwrites details an existing account already has.
 * A returning user finishing an anonymous draft must not have their saved
 * business profile clobbered by whatever they typed while logged out.
 */
async function adoptDraftBusiness(userId: string, raw: unknown): Promise<void> {
  const business = draftBusinessOf(raw)
  if (!business) return

  const [existing] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!existing) return

  const patch: Record<string, string> = {}
  if (!existing.businessName && business.name) patch.businessName = business.name
  if (!existing.businessEmail && business.email) patch.businessEmail = business.email
  if (!existing.businessAddress && business.address) {
    patch.businessAddress = business.address
  }

  if (Object.keys(patch).length > 0) {
    await db.update(users).set(patch).where(eq(users.id, userId))
  }
}
