// Every schema change golf needs, as idempotent DDL. Safe to run any
// number of times — each step is IF NOT EXISTS or ON CONFLICT.
//
//   npm run db:migrate           # dry run: says what it WOULD do
//   npm run db:migrate -- --apply
//
// Loads .env.local the same way src/lib/db/seed.ts does. drizzle.config.ts
// has no dotenv import — drizzle-kit only auto-loads `.env`, not
// `.env.local` — so `db:push` is not a reliable way to ship this, and it
// cannot backfill rows in any case. This script does both.
//
// Add new changes to the bottom rather than writing another one-off.

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

  // The scoring columns added alongside the cut-bonus fix.
  const [cols] = (await sql`
    SELECT
      bool_or(table_name = 'tournaments'    AND column_name = 'cut_applied')  AS cut_applied,
      bool_or(table_name = 'golfer_results' AND column_name = 'is_withdrawn') AS is_withdrawn
    FROM information_schema.columns
    WHERE table_schema = 'golf'
  `) as Array<{ cut_applied: boolean; is_withdrawn: boolean }>

  const [orph] = (await sql`
    SELECT count(*)::int AS n FROM golf.golfers WHERE external_id IS NULL
  `) as Array<{ n: number }>
  const [refs] = (await sql`
    SELECT count(*)::int AS n FROM golf.pool_entries e
    WHERE EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(e.golfer_ids) gid
      JOIN golf.golfers g ON g.id = gid::uuid
      WHERE g.external_id IS NULL
    )
  `) as Array<{ n: number }>

  console.log(`  pool_tournaments table   ${exists ? 'already exists' : 'MISSING — will create'}`)
  console.log(`  golfers with no id       ${orph.n}  → WILL BE DELETED`)
  console.log(`  of those, on a roster    ${refs.n}  ${refs.n === 0 ? '(safe)' : '← STOP, would break a roster'}`)
  console.log(`  tournaments.cut_applied  ${cols?.cut_applied ? 'already exists' : 'MISSING — will add'}`)
  console.log(`  results.is_withdrawn     ${cols?.is_withdrawn ? 'already exists' : 'MISSING — will add'}`)
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

  // The purge is the only destructive step here. It is safe purely
  // because no roster references those rows — so verify that every run
  // rather than trusting a check made once.
  if (refs.n > 0) {
    console.error(
      `\n  ABORT: ${refs.n} pool entries reference golfers with no SlashGolf id.\n` +
        `  Deleting them would blank out picks people already made.\n`
    )
    process.exit(1)
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

  // --- Cut-bonus semantics -------------------------------------------
  // made_cut_bonus used to pay everyone from round 1, pay withdrawals,
  // and pay out at no-cut events. These two columns are what let the
  // engine tell "survived a cut" from "there was never a cut".
  await sql`
    ALTER TABLE golf.tournaments
      ADD COLUMN IF NOT EXISTS cut_applied boolean NOT NULL DEFAULT false
  `
  await sql`
    ALTER TABLE golf.golfer_results
      ADD COLUMN IF NOT EXISTS is_withdrawn boolean NOT NULL DEFAULT false
  `
  console.log('  ✓ cut_applied / is_withdrawn columns')

  // Past events: anyone recorded as cut proves that event had a cut and
  // it landed, so back-date the flag rather than leaving history wrong.
  const backdated = await sql`
    UPDATE golf.tournaments t
    SET cut_applied = true
    WHERE cut_applied = false
      AND EXISTS (
        SELECT 1 FROM golf.golfer_results r
        WHERE r.tournament_id = t.id AND r.is_cut = true
      )
    RETURNING t.id
  `
  console.log(`  ✓ back-dated cut_applied on ${backdated.length} past event(s)`)

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

  // --- Per-event rosters --------------------------------------------
  // A flat golferIds list can't survive a waiver: a dropped golfer must
  // keep the points he already earned and score nothing after, and an
  // added one must score nothing before. Rosters are per (entry, event).
  await sql`
    CREATE TABLE IF NOT EXISTS golf.pool_entry_rosters (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      entry_id uuid NOT NULL REFERENCES golf.pool_entries(id),
      tournament_id uuid NOT NULL REFERENCES golf.tournaments(id),
      golfer_id uuid NOT NULL REFERENCES golf.golfers(id),
      added_at timestamp
    )
  `
  await sql`
    DO $$ BEGIN
      ALTER TABLE golf.pool_entry_rosters
        ADD CONSTRAINT golf_entry_roster_key UNIQUE (entry_id, tournament_id, golfer_id);
    EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL;
    END $$
  `
  await sql`
    CREATE INDEX IF NOT EXISTS golf_entry_roster_entry_idx
      ON golf.pool_entry_rosters (entry_id, tournament_id)
  `
  await sql`
    CREATE INDEX IF NOT EXISTS golf_entry_roster_tournament_idx
      ON golf.pool_entry_rosters (tournament_id)
  `
  console.log('  ✓ pool_entry_rosters table')

  // Backfill: every drafted team's current list becomes its roster for
  // every event in its pool. Correct because no waiver has run yet.
  const rosterRows = await sql`
    INSERT INTO golf.pool_entry_rosters (entry_id, tournament_id, golfer_id)
    SELECT e.id, pt.tournament_id, gid::uuid
    FROM golf.pool_entries e
    JOIN golf.pool_tournaments pt ON pt.pool_id = e.pool_id
    JOIN jsonb_array_elements_text(e.golfer_ids) gid ON true
    ON CONFLICT ON CONSTRAINT golf_entry_roster_key DO NOTHING
    RETURNING id
  `
  console.log(`  ✓ backfilled ${rosterRows.length} roster row(s)`)

  // --- Purge the pre-SlashGolf golfer import ------------------------
  // 224 rows from an older source: ASCII-folded names ("Ludvig Aberg"
  // for "Ludvig Åberg") and NO SlashGolf playerId. The tournament sync
  // matches on playerId, so these can never enter a field, be drafted,
  // or score — they exist only to show up twice in the players list
  // once the OWGR pull inserts the real row. Verified before writing
  // this: ZERO of them appear in any pool roster, so nothing a user has
  // ever picked is affected.
  await sql`
    DELETE FROM golf.golfer_results
    WHERE golfer_id IN (SELECT id FROM golf.golfers WHERE external_id IS NULL)
  `
  await sql`
    DELETE FROM golf.tournament_field
    WHERE golfer_id IN (SELECT id FROM golf.golfers WHERE external_id IS NULL)
  `
  const purged = await sql`
    DELETE FROM golf.golfers WHERE external_id IS NULL RETURNING id
  `
  console.log(`  ✓ purged ${purged.length} golfer(s) with no SlashGolf id`)

  // Make the duplicate class structurally impossible from here on: a
  // golfer with no playerId is invisible to the sync by construction,
  // so there is no legitimate reason for one to exist.
  await sql`
    ALTER TABLE golf.golfers ALTER COLUMN external_id SET NOT NULL
  `
  await sql`
    ALTER TABLE golf.golfers
      ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now()
  `
  console.log('  ✓ external_id NOT NULL + updated_at column')

  const [{ dupes }] = (await sql`
    SELECT count(*)::int AS dupes FROM (
      SELECT lower(name) FROM golf.golfers GROUP BY lower(name) HAVING count(*) > 1
    ) d
  `) as Array<{ dupes: number }>

  console.log(`\n  duplicate golfer names      ${dupes}   ${dupes === 0 ? '✓' : '← check these'}`)
  console.log(`  pools with no events        ${missing}   ${missing === 0 ? '✓' : '← PROBLEM'}`)
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
