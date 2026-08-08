import { cookies } from 'next/headers'
import { newAnonymousSessionId } from './tokens'

/**
 * Identifies a pre-signup visitor so their in-progress invoice survives a
 * refresh and can be claimed into an account at signup. It is not a
 * credential — it grants access only to drafts with no owner.
 */
const ANON_COOKIE = 'fi_anon'
const ANON_TTL_DAYS = 30

export async function getAnonymousSessionId(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(ANON_COOKIE)?.value ?? null
}

/**
 * Only callable from a Server Action or Route Handler — Next forbids setting
 * cookies while rendering.
 */
export async function ensureAnonymousSessionId(): Promise<string> {
  const jar = await cookies()
  const existing = jar.get(ANON_COOKIE)?.value
  if (existing) return existing

  const id = newAnonymousSessionId()
  jar.set(ANON_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(Date.now() + ANON_TTL_DAYS * 86_400_000),
  })
  return id
}

export async function clearAnonymousSessionId(): Promise<void> {
  const jar = await cookies()
  jar.delete(ANON_COOKIE)
}
