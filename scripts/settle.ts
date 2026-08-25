// Backfill hole-by-hole scorecards for a finished event.
//
//   npm run settle -- "BMW Championship"
//
// Only rostered golfers get scorecards during play (one API call each,
// per pass). This fills in everyone else once the event is over, which
// is what makes free-agent points and season FPts real rather than ~0.
//
// Runs in capped batches with a pause between them, and is idempotent —
// re-run it until "remaining" hits 0.

import { config } from 'dotenv'
config({ path: '.env.local' })

import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq } from 'drizzle-orm'
import * as schema from '../src/lib/db/schema.js'
import { golfTournaments, golfPools } from '../src/lib/db/schema.js'
import { settleScorecards } from '../src/lib/scoring/settleScorecards.js'
import { recalculatePool } from '../src/lib/scoring/recalculatePool.js'
import { recomputeSeasonStats } from '../src/lib/scoring/seasonStats.js'

const url = process.env.DATABASE_URL
if (!url) { console.error('DATABASE_URL is not set.'); process.exit(1) }

const args = process.argv.slice(2)
const name = args.find((a) => !a.startsWith('--'))
if (!name) {
  console.error('Usage: npm run settle -- "Event Name"')
  process.exit(1)
}

const db = drizzle(neon(url), { schema })

async function main() {
  const [t] = await db.select().from(golfTournaments).where(eq(golfTournaments.name, name!))
  if (!t) { console.error(`\n  No event named "${name}".\n`); process.exit(1) }

  console.log(`\n  ${t.name} — ${t.status}\n`)
  let round = 0
  for (;;) {
    const r = await settleScorecards(db, t)
    round++
    console.log(`  batch ${round}: filled ${r.filled}/${r.attempted}, ${r.remaining} remaining`)
    if (r.remaining === 0 || r.attempted === 0) break
    if (r.filled === 0) {
      console.log('  no progress this batch — stopping so it cannot loop forever')
      break
    }
  }

  // Everything downstream reads these stats, so refresh it here rather
  // than waiting for the next hourly cron.
  const pools = await db.select().from(golfPools)
  let rescored = 0
  for (const p of pools) rescored += await recalculatePool(db, p)
  const golfers = await recomputeSeasonStats(db, t.season)
  console.log(`\n  rescored ${rescored} entries, refreshed ${golfers} golfer season stats\n`)
}

main().catch((err) => {
  console.error('\n  Failed:', err instanceof Error ? err.message : err, '\n')
  process.exit(1)
})
