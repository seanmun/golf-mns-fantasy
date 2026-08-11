import { asc, eq, inArray } from 'drizzle-orm'
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import { golfPoolTournaments, golfTournaments } from './schema.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = NeonHttpDatabase<any>

type PoolRef = { id: string; tournamentId: string }

// Every event a pool scores, earliest first.
//
// The fallback matters: a pool with no pool_tournaments rows (created
// before the join table existed, or a backfill that hasn't run) scores
// its own tournamentId exactly as it always did. Without it those pools
// would silently score zero, which is far worse than being single-event.
export async function poolTournamentIds(db: Db, pool: PoolRef): Promise<string[]> {
  const rows = await db
    .select({ tournamentId: golfPoolTournaments.tournamentId })
    .from(golfPoolTournaments)
    .where(eq(golfPoolTournaments.poolId, pool.id))
    .orderBy(asc(golfPoolTournaments.sortOrder))
  if (rows.length === 0) return [pool.tournamentId]
  return rows.map((r) => r.tournamentId)
}

// The same list as full tournament rows, in play order — for anything
// that needs names, dates or status rather than just ids.
export async function poolTournamentRows(db: Db, pool: PoolRef) {
  const ids = await poolTournamentIds(db, pool)
  const rows = await db
    .select()
    .from(golfTournaments)
    .where(inArray(golfTournaments.id, ids))
  const byId = new Map(rows.map((t) => [t.id, t]))
  // Order by the pool's own sequence, not the database's.
  return ids.map((id) => byId.get(id)).filter(Boolean) as Array<typeof golfTournaments.$inferSelect>
}

// Reverse lookup for the sync: which pools score this event? Unions the
// join table with pools.tournamentId so single-event pools are found
// whether or not they have been backfilled.
export async function poolIdsForTournament(db: Db, tournamentId: string): Promise<string[]> {
  const rows = await db
    .select({ poolId: golfPoolTournaments.poolId })
    .from(golfPoolTournaments)
    .where(eq(golfPoolTournaments.tournamentId, tournamentId))
  return [...new Set(rows.map((r) => r.poolId))]
}
