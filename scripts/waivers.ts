// Inspect or run a pool's waiver window.
//
//   npm run waivers -- "Pool Name"            # window state + dry run
//   npm run waivers -- "Pool Name" --apply    # process for real, now
//
// The cron processes automatically 24h before the next event locks.
// This exists because that run is unattended and rewrites rosters: the
// dry run shows exactly who would get whom, modelling contention the
// same way the real pass does, so it can be checked first.

import { config } from 'dotenv'
config({ path: '.env.local' })

import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq } from 'drizzle-orm'
import * as schema from '../src/lib/db/schema.js'
import { golfPools, golfWaiverClaims, golfGolfers, users, golfPoolEntries } from '../src/lib/db/schema.js'
import { waiverWindowFor, processWaivers } from '../src/lib/waivers/engine.js'

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
  console.error('Usage: npm run waivers -- "Pool Name" [--apply] [--force]')
  process.exit(1)
}

const db = drizzle(neon(url), { schema })

async function main() {
  const [pool] = await db.select().from(golfPools).where(eq(golfPools.name, name!)).limit(1)
  if (!pool) {
    console.error(`\n  No pool named "${name}".\n`)
    process.exit(1)
  }

  const win = await waiverWindowFor(db, pool)
  console.log(`\n  pool       "${pool.name}"`)
  console.log(`  window     ${win.tournament?.name ?? 'none'}`)
  console.log(`  open       ${win.isOpen}${win.reason ? `  (${win.reason})` : ''}`)
  console.log(`  processAt  ${win.processAt?.toISOString() ?? '—'}`)

  if (!win.tournament) {
    console.log()
    return
  }

  const claims = await db
    .select({
      status: golfWaiverClaims.status,
      addGolferIds: golfWaiverClaims.addGolferIds,
      dropGolferId: golfWaiverClaims.dropGolferId,
      team: users.displayName,
      points: golfPoolEntries.totalPoints,
    })
    .from(golfWaiverClaims)
    .innerJoin(golfPoolEntries, eq(golfWaiverClaims.entryId, golfPoolEntries.id))
    .innerJoin(users, eq(golfPoolEntries.userId, users.id))
    .where(eq(golfWaiverClaims.tournamentId, win.tournament.id))

  console.log(`\n  claims     ${claims.length}`)
  const allIds = [
    ...new Set(claims.flatMap((c) => [...(c.addGolferIds as string[]), c.dropGolferId])),
  ]
  const names = new Map(
    allIds.length
      ? (await db.select({ id: golfGolfers.id, name: golfGolfers.name }).from(golfGolfers)).map(
          (g) => [g.id, g.name]
        )
      : []
  )
  for (const c of claims) {
    const adds = (c.addGolferIds as string[]).map((i) => names.get(i) ?? i).join(' → ')
    console.log(`    ${c.team} (${Number(c.points).toFixed(0)} pts) [${c.status}]`)
    console.log(`      drop ${names.get(c.dropGolferId) ?? c.dropGolferId}`)
    console.log(`      add  ${adds}`)
  }

  const result = await processWaivers(db, pool, { force: force || !apply, dryRun: !apply })
  console.log(`\n  ${apply ? 'APPLIED' : 'DRY RUN — nothing written'}`)
  if (result.reason) console.log(`  ${result.reason}`)
  for (const g of result.granted) {
    console.log(`    ✓ ${g.team}: +${g.added}  −${g.dropped}`)
  }
  for (const f of result.failed) {
    console.log(`    ✗ ${f.team}: ${f.reason}`)
  }
  console.log()
}

main().catch((err) => {
  console.error('\n  Failed:', err instanceof Error ? err.message : err, '\n')
  process.exit(1)
})
