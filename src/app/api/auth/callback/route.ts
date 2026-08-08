import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { documents, users } from '@/db/schema'
import { clearAnonymousSessionId, getAnonymousSessionId } from '@/lib/anon'
import { consumeLoginToken, createSession, findOrCreateUser } from '@/lib/auth'
import { draftBusinessOf } from '@/lib/draft-business'
import { claimDraft } from '@/lib/invoices'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  if (!token) redirect('/login?error=missing')

  const consumed = await consumeLoginToken(token)
  if (!consumed) redirect('/login?error=expired')

  const user = await findOrCreateUser(consumed.email)
  await createSession(user.id)

  // Bring the pre-signup draft into the new account, along with the business
  // details typed into it — otherwise the user retypes everything.
  let claimedId: string | null = null
  if (consumed.claimDraftId) {
    const anonId = await getAnonymousSessionId()
    if (anonId) {
      const [draft] = await db
        .select()
        .from(documents)
        .where(eq(documents.id, consumed.claimDraftId))
        .limit(1)

      if (await claimDraft(consumed.claimDraftId, user.id, anonId)) {
        claimedId = consumed.claimDraftId
        await adoptDraftBusiness(user.id, draft?.draftBusiness)
        await clearAnonymousSessionId()
      }
    }
  }

  redirect(claimedId ? `/invoices/${claimedId}/edit?claimed=1` : '/invoices')
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
