import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

type Db = PostgresJsDatabase<typeof schema>

declare global {
  // eslint-disable-next-line no-var
  var __fi_sql: ReturnType<typeof postgres> | undefined
}

let cached: Db | undefined

/**
 * Connects on first query, not at import time. `next build` imports every route
 * module to analyse it, so throwing on a missing DATABASE_URL at module scope
 * would break builds on any machine without a database — including CI.
 */
function getDb(): Db {
  if (cached) return cached

  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.',
    )
  }

  // prepare:false keeps this compatible with transaction-mode poolers
  // (PgBouncer, the Supabase pooler, Neon's pooled endpoint).
  const sql =
    globalThis.__fi_sql ?? postgres(url, { prepare: false, max: 5 })

  // Reuse the pool across hot reloads in dev so we don't exhaust connections.
  if (process.env.NODE_ENV !== 'production') globalThis.__fi_sql = sql

  cached = drizzle(sql, { schema })
  return cached
}

export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb()
    const value = Reflect.get(real, prop) as unknown
    return typeof value === 'function' ? value.bind(real) : value
  },
})

export { schema }
