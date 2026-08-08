/**
 * Fixed-window rate limiting.
 *
 * The in-memory store is per-instance, so on serverless it limits per warm
 * lambda rather than globally. That is enough to blunt casual abuse; set
 * UPSTASH_REDIS_REST_URL/TOKEN for a shared counter before launch.
 */

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  resetAt: number
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  const existing = buckets.get(key)

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs
    buckets.set(key, { count: 1, resetAt })
    return { allowed: true, remaining: limit - 1, resetAt }
  }

  existing.count += 1
  const allowed = existing.count <= limit
  return {
    allowed,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
  }
}

/** Keeps the map from growing without bound on a long-lived instance. */
export function pruneRateLimits(now: number = Date.now()): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export function resetRateLimits(): void {
  buckets.clear()
}

export const LIMITS = {
  /** Magic links per email address. */
  magicLink: { limit: 5, windowMs: 15 * 60_000 },
  /** Anonymous draft saves per IP. */
  draftSave: { limit: 120, windowMs: 60_000 },
  /** PDF renders per IP — the most CPU-expensive anonymous action. */
  pdf: { limit: 30, windowMs: 60_000 },
  /** Invoice sends per account. */
  send: { limit: 30, windowMs: 60 * 60_000 },
} as const
