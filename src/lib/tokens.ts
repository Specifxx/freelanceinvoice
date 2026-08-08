import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Public invoice URLs are guessable only at 2^128. Never expose sequential
 * ids — an incrementing id in /i/:token would let anyone enumerate every
 * invoice in the system.
 */
export function newPublicToken(): string {
  return randomBytes(16).toString('base64url')
}

/** Session and magic-link tokens get 256 bits; they authenticate a person. */
export function newSecretToken(): string {
  return randomBytes(32).toString('base64url')
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

/** Constant-time compare for anything secret-derived. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * We record that an invoice was viewed, not who viewed it. Salting with
 * AUTH_SECRET means the stored digest is useless to anyone reading the table.
 */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  const salt = process.env.AUTH_SECRET ?? 'dev-salt'
  return sha256(`${salt}:${ip}`).slice(0, 32)
}

export function newAnonymousSessionId(): string {
  return randomBytes(16).toString('base64url')
}
