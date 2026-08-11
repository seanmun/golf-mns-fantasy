import { sql } from 'drizzle-orm'
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import { golfGolfers } from '../db/schema.js'
import { sgFetch, num, type SgRankings } from '../../../api/_slashgolf.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = NeonHttpDatabase<any>

export interface GolferSyncResult {
  totalRanked: number
  upserted: number
}

// Pull the full OWGR list and upsert every golfer by SlashGolf playerId.
//
// ONE statement, not one per golfer. The previous version issued a
// select plus an insert/update for each of ~998 players — roughly 2,000
// sequential round trips, which overruns the serverless function limit
// partway through and leaves the table silently incomplete. That is how
// 895 of 998 golfers ended up stored, and how six of the FedEx playoff
// field came to be missing from the draft.
//
// externalId is the identity. Names are refreshed from the API on every
// run, so SlashGolf's spelling (with diacritics) always wins.
export async function syncGolfers(db: Db, season: number): Promise<GolferSyncResult> {
  const wgr = await sgFetch<SgRankings>(`stats?year=${season}&statId=186`)
  const rankings = wgr.rankings ?? []
  if (rankings.length === 0) {
    throw new Error('SlashGolf OWGR returned no rankings')
  }

  const rows = rankings.map((r) => ({
    name: r.fullName,
    worldRanking: num(r.rank),
    externalId: String(r.playerId),
    isActive: true,
  }))

  await db
    .insert(golfGolfers)
    .values(rows)
    .onConflictDoUpdate({
      target: golfGolfers.externalId,
      set: {
        name: sql`excluded.name`,
        worldRanking: sql`excluded.world_ranking`,
        isActive: sql`excluded.is_active`,
        updatedAt: sql`now()`,
      },
    })

  return { totalRanked: rankings.length, upserted: rows.length }
}
