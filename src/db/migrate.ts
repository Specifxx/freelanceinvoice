import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

/** Run with: npm run db:migrate */
async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is not set.')
    process.exit(1)
  }

  // max:1 — migrations must run on a single connection, in order.
  const sql = postgres(url, { max: 1 })
  try {
    await migrate(drizzle(sql), { migrationsFolder: './src/db/migrations' })
    console.log('Migrations applied.')
  } finally {
    await sql.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
