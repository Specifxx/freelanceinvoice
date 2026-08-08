import { and, eq, gt, isNull, lt } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { loginTokens, sessions, users, type User } from '@/db/schema'
import { newSecretToken, sha256 } from './tokens'

/**
 * Passwordless magic-link auth, hand-rolled rather than pulled from a library.
 * The surface is small enough to reason about completely: token entropy,
 * hashed at rest, single use, short expiry, and an httpOnly session cookie.
 *
 * Neither a login token nor a session token is ever stored in plaintext — a
 * leaked database backup does not hand over live sessions.
 */

const SESSION_COOKIE = 'fi_session'
const SESSION_TTL_DAYS = 30
const LOGIN_TOKEN_TTL_MINUTES = 15

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidEmail(email: string): boolean {
  // Deliberately permissive: the magic link is the real proof of ownership.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

// ---------------------------------------------------------------------------
// Magic-link tokens
// ---------------------------------------------------------------------------

export async function createLoginToken(options: {
  email: string
  claimDraftId?: string | null
  /**
   * Captured from the REQUESTER's cookie, so the draft claim survives the link
   * being opened on a different device.
   */
  anonymousSessionId?: string | null
}): Promise<string> {
  const token = newSecretToken()
  const expiresAt = new Date(Date.now() + LOGIN_TOKEN_TTL_MINUTES * 60_000)

  await db.insert(loginTokens).values({
    tokenHash: sha256(token),
    email: normalizeEmail(options.email),
    claimDraftId: options.claimDraftId ?? null,
    anonymousSessionId: options.anonymousSessionId ?? null,
    expiresAt,
  })

  return token
}

export type ConsumedToken = {
  email: string
  claimDraftId: string | null
  anonymousSessionId: string | null
}

/** Reads a token without spending it, for rendering the confirm screen. */
export async function peekLoginToken(
  token: string,
): Promise<{ email: string; hasDraft: boolean } | null> {
  const [row] = await db
    .select()
    .from(loginTokens)
    .where(
      and(
        eq(loginTokens.tokenHash, sha256(token)),
        isNull(loginTokens.usedAt),
        gt(loginTokens.expiresAt, new Date()),
      ),
    )
    .limit(1)

  if (!row) return null
  return { email: row.email, hasDraft: Boolean(row.claimDraftId) }
}

/**
 * Single-use: the UPDATE only matches rows where used_at IS NULL, so two
 * concurrent clicks on the same link cannot both succeed.
 *
 * Only ever called from a POST. Corporate mail gateways and inbox assistants
 * routinely GET every URL in a message to scan it; if that spent the token, the
 * human who clicks afterwards would be permanently locked out with no recovery
 * path — there is no password to fall back on.
 */
export async function consumeLoginToken(
  token: string,
): Promise<ConsumedToken | null> {
  const hash = sha256(token)
  const now = new Date()

  const [row] = await db
    .update(loginTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(loginTokens.tokenHash, hash),
        isNull(loginTokens.usedAt),
        gt(loginTokens.expiresAt, now),
      ),
    )
    .returning()

  if (!row) return null
  return {
    email: row.email,
    claimDraftId: row.claimDraftId,
    anonymousSessionId: row.anonymousSessionId,
  }
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function createSession(userId: string): Promise<void> {
  const token = newSecretToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000)

  await db.insert(sessions).values({
    tokenHash: sha256(token),
    userId,
    expiresAt,
  })

  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

export async function destroySession(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)))
  }
  jar.delete(SESSION_COOKIE)
}

/** The signed-in user, or null. Safe to call from any server component. */
export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (!token) return null

  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, sha256(token)),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1)

  return rows[0]?.user ?? null
}

/** For pages that must not render without a user. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

export async function findOrCreateUser(email: string): Promise<User> {
  const normalized = normalizeEmail(email)

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1)
  if (existing[0]) return existing[0]

  const [created] = await db
    .insert(users)
    .values({ email: normalized })
    // Two concurrent magic-link clicks for a new address would otherwise
    // race to insert the same email.
    .onConflictDoNothing({ target: users.email })
    .returning()
  if (created) return created

  const [raced] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1)
  if (!raced) throw new Error('Failed to create or find user')
  return raced
}

/**
 * Housekeeping for the cron sweep — expired rows are dead weight. Used tokens
 * are covered by the same expiry check; the worst case is one lingering for
 * the remainder of its 15-minute TTL, and it is already unusable.
 */
export async function purgeExpiredAuthRows(): Promise<void> {
  const now = new Date()
  await db.delete(sessions).where(lt(sessions.expiresAt, now))
  await db.delete(loginTokens).where(lt(loginTokens.expiresAt, now))
}
