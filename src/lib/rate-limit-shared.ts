import { sql } from 'drizzle-orm'
import { db } from '@/db'
import { rateLimit as memoryRateLimit, type RateLimitResult } from './rate-limit'

/**
 * Rate limiting backed by Postgres, for endpoints where a per-instance counter
 * is not good enough.
 *
 * The in-memory limiter is a module-level Map. On Vercel every concurrent
 * lambda gets its own, so "5 per 15 minutes" actually means "5 per instance per
 * 15 minutes" — an attacker fanning out across instances multiplies it by the
 * instance count. That is tolerable for draft saves and PDF renders, where the
 * cost of abuse is our own CPU. It is not tolerable for /api/auth/magic-link,
 * which emails an arbitrary address from the single verified domain that every
 * invoice we send depends on: a mail-bomb there earns spam complaints against
 * the domain and takes deliverability down with it.
 *
 * One atomic upsert per check. The CASE resets the window in the same statement
 * that increments, so concurrent requests cannot both see a stale window and
 * both reset it.
 */
export async function sharedRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const seconds = Math.max(1, Math.round(windowMs / 1000))

  try {
    const rows = await db.execute<{ count: number; window_start: Date }>(sql`
      INSERT INTO rate_limits (key, count, window_start)
      VALUES (${key}, 1, now())
      ON CONFLICT (key) DO UPDATE SET
        count = CASE
          WHEN rate_limits.window_start < now() - make_interval(secs => ${seconds})
          THEN 1
          ELSE rate_limits.count + 1
        END,
        window_start = CASE
          WHEN rate_limits.window_start < now() - make_interval(secs => ${seconds})
          THEN now()
          ELSE rate_limits.window_start
        END
      RETURNING count, window_start
    `)

    const row = rows[0]
    if (!row) return memoryRateLimit(key, limit, windowMs)

    const count = Number(row.count)
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt: new Date(row.window_start).getTime() + windowMs,
    }
  } catch (error) {
    // A limiter that hard-fails would take sign-in down with it. Degrade to the
    // per-instance counter, which is weaker but never blocks a real user.
    console.error('[rate-limit] shared store unavailable, falling back', error)
    return memoryRateLimit(key, limit, windowMs)
  }
}

/** Best-effort cleanup of windows that expired long ago. Called from the cron. */
export async function purgeStaleRateLimits(): Promise<void> {
  try {
    await db.execute(
      sql`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`,
    )
  } catch (error) {
    console.error('[rate-limit] purge failed', error)
  }
}
