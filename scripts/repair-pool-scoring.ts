// Re-stamp a pool's scoring_config with the CURRENT defaults.
//
// Scoring is frozen into a pool at creation, and nothing exposes it for
// editing — so a pool created before a scoring change keeps the old
// numbers forever. This is the escape hatch.
//
//   npm run db:repair-scoring -- "Pool Name"
//   npm run db:repair-scoring -- "Pool Name" --apply
//
// Refuses to touch a pool that has already scored points unless you pass
// --force, so it can't silently rewrite a finished pool's history.

import { config } from 'dotenv'
config({ path: '.env.local' })

import { neon } from '@neondatabase/serverless'
import { DEFAULT_SCORING } from '../src/lib/scoring/engine.js'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const force = args.includes('--force')
const name = args.find((a) => !a.startsWith('--'))

if (!name) {
  console.error('Usage: npm run db:repair-scoring -- "Pool Name" [--apply] [--force]')
  process.exit(1)
}

const sql = neon(url)

async function main() {
  console.log(`\n  database  ${new URL(url!).host}`)
  console.log(`  mode      ${apply ? 'APPLY — will write' : 'dry run — no writes'}\n`)

  const pools = (await sql`
    SELECT p.id, p.name, p.status, p.scoring_config,
           (SELECT count(*)::int FROM golf.pool_entries e
             WHERE e.pool_id = p.id AND e.total_points <> 0) AS scored_entries
    FROM golf.pools p
    WHERE p.name = ${name}
  `) as any[]

  if (pools.length === 0) {
    console.error(`  No pool named "${name}".\n`)
    process.exit(1)
  }
  if (pools.length > 1) {
    console.error(`  ${pools.length} pools share that name. Refusing to guess.\n`)
    process.exit(1)
  }

  const pool = pools[0]
  const before = pool.scoring_config ?? {}
  const beforePositions = Object.keys(before.position_bonuses ?? {}).length
  const afterPositions = Object.keys(DEFAULT_SCORING.position_bonuses).length

  console.log(`  pool      "${pool.name}"  (${pool.status})`)
  console.log(`  placement ${beforePositions} places  →  ${afterPositions} places`)
  console.log(`  cut bonus ${before.made_cut_bonus}  →  ${DEFAULT_SCORING.made_cut_bonus}`)
  console.log(
    `\n  Note: the cut FIX is in code, not config — the bonus is gated on\n` +
      `  tournaments.cut_applied, so it already won't pay at a no-cut event.\n` +
      `  This only re-stamps the numbers.\n`
  )

  if (pool.scored_entries > 0 && !force) {
    console.error(
      `  ${pool.scored_entries} entries already have points. Rewriting scoring now\n` +
        `  would change results that people have already seen.\n` +
        `  Pass --force if you really mean it.\n`
    )
    process.exit(1)
  }

  if (!apply) {
    console.log('  Nothing written. Re-run with --apply.\n')
    return
  }

  await sql`
    UPDATE golf.pools
    SET scoring_config = ${JSON.stringify(DEFAULT_SCORING)}::jsonb,
        updated_at = now()
    WHERE id = ${pool.id}
  `

  const [after] = (await sql`
    SELECT scoring_config->'position_bonuses'->>'30' AS pos30,
           scoring_config->'position_bonuses'->>'1'  AS pos1
    FROM golf.pools WHERE id = ${pool.id}
  `) as any[]

  console.log(`  ✓ updated. 1st = +${after.pos1}, 30th = +${after.pos30}\n`)
}

main().catch((err) => {
  console.error('\n  Failed:', err instanceof Error ? err.message : err, '\n')
  process.exit(1)
})
