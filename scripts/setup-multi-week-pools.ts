// Creates golf.pool_tournaments and backfills a row for every existing
// pool. Idempotent — safe to run twice.
//
//   npm run db:multiweek           # dry run: says what it WOULD do
//   npm run db:multiweek -- --apply
//
// Loads .env.local the same way src/lib/db/seed.ts does. drizzle.config.ts
// has no dotenv import, so `db:push` is not a reliable way to ship this.
// This script does the DDL itself and needs no push.

import { config } from 'dotenv'
config({ path: '.env.local' })

import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set. Add it to .env.local — ideally a Neon BRANCH.')
  process.exit(1)
}

const apply = process.argv.includes('--apply')
const sql = neon(url)

// Print the target before touching anything: this is the only chance to
// notice you are pointed at production instead of a branch.
const host = new URL(url).host
const dbName = new URL(url).pathname.replace(/^\//, '')

async function main() {
  console.log(`\n  database  ${dbName} @ ${host}`)
  console.log(`  mode      ${apply ? 'APPLY — will write' : 'dry run — no writes'}\n`)

  const [{ exists }] = (await sql`
    SELECT to_regclass('golf.pool_tournaments') IS NOT NULL AS exists
  `) as Array<{ exists: boolean }>

  const [{ pools }] = (await sql`
    SELECT count(*)::int AS pools FROM golf.pools
  `) as Array<{ pools: number }>

  console.log(`  pool_tournaments table   ${exists ? 'already exists' : 'MISSING — will create'}`)
  console.log(`  pools in this database   ${pools}`)

  if (exists) {
    const [{ missing }] = (await sql`
      SELECT count(*)::int AS missing
      FROM golf.pools p
      WHERE NOT EXISTS (
        SELECT 1 FROM golf.pool_tournaments pt WHERE pt.pool_id = p.id
      )
    `) as Array<{ missing: number }>
    console.log(`  pools needing a backfill row   ${missing}`)
  } else {
    console.log(`  pools needing a backfill row   ${pools} (all of them)`)
  }

  if (!apply) {
    console.log('\n  Nothing written. Re-run with --apply to make these changes.\n')
    return
  }

  console.log('\n  applying...')

  await sql`
    CREATE TABLE IF NOT EXISTS golf.pool_tournaments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      pool_id uuid NOT NULL REFERENCES golf.pools(id),
      tournament_id uuid NOT NULL REFERENCES golf.tournaments(id),
      sort_order integer NOT NULL DEFAULT 0
    )
  `
  console.log('  ✓ table')

  // Postgres has no ADD CONSTRAINT IF NOT EXISTS.
  await sql`
    DO $$ BEGIN
      ALTER TABLE golf.pool_tournaments
        ADD CONSTRAINT golf_pool_tournaments_pool_tournament_key
        UNIQUE (pool_id, tournament_id);
    EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL;
    END $$
  `
  console.log('  ✓ unique (pool_id, tournament_id)')

  await sql`
    CREATE INDEX IF NOT EXISTS golf_pool_tournaments_pool_idx
      ON golf.pool_tournaments (pool_id)
  `
  await sql`
    CREATE INDEX IF NOT EXISTS golf_pool_tournaments_tournament_idx
      ON golf.pool_tournaments (tournament_id)
  `
  console.log('  ✓ indexes')

  // Every existing pool is single-event: one row at sortOrder 0 pointing
  // at the tournament_id it already had.
  const inserted = await sql`
    INSERT INTO golf.pool_tournaments (pool_id, tournament_id, sort_order)
    SELECT p.id, p.tournament_id, 0
    FROM golf.pools p
    ON CONFLICT (pool_id, tournament_id) DO NOTHING
    RETURNING id
  `
  console.log(`  ✓ backfilled ${inserted.length} pool(s)`)

  // Verify rather than assume.
  const [{ missing }] = (await sql`
    SELECT count(*)::int AS missing
    FROM golf.pools p
    WHERE NOT EXISTS (
      SELECT 1 FROM golf.pool_tournaments pt WHERE pt.pool_id = p.id
    )
  `) as Array<{ missing: number }>

  const [{ mismatched }] = (await sql`
    SELECT count(*)::int AS mismatched
    FROM golf.pools p
    JOIN golf.pool_tournaments pt ON pt.pool_id = p.id AND pt.sort_order = 0
    WHERE pt.tournament_id <> p.tournament_id
  `) as Array<{ mismatched: number }>

  console.log(`\n  pools with no events        ${missing}   ${missing === 0 ? '✓' : '← PROBLEM'}`)
  console.log(`  first-event mismatches      ${mismatched}   ${mismatched === 0 ? '✓' : '← PROBLEM'}`)

  if (missing === 0 && mismatched === 0) {
    console.log('\n  Done. Every pool has its events.\n')
  } else {
    console.log('\n  Finished with problems above — do not deploy until they are 0.\n')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('\n  Failed:', err instanceof Error ? err.message : err, '\n')
  process.exit(1)
})
