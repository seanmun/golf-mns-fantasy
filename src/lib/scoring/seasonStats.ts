import { eq, inArray } from 'drizzle-orm'
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import {
  golfGolfers,
  golfTournaments,
  golfGolferResults,
  type GolferSeasonStats,
} from '../db/schema.js'
import { calculateGolferPoints, DEFAULT_SCORING } from './engine.js'
import { statsFromResult } from './recalculatePool.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = NeonHttpDatabase<any>

// Recompute per-golfer season aggregates from our own golfer_results.
// FPts use DEFAULT_SCORING so the number matches what pools score by
// default. Returns the number of golfers updated.
export async function recomputeSeasonStats(db: Db, season: number): Promise<number> {
  const tournaments = await db
    .select({ id: golfTournaments.id })
    .from(golfTournaments)
    .where(eq(golfTournaments.season, season))
  if (tournaments.length === 0) return 0
  const tournamentIds = tournaments.map((t) => t.id)

  const results = await db
    .select()
    .from(golfGolferResults)
    .where(inArray(golfGolferResults.tournamentId, tournamentIds))

  const byGolfer = new Map<string, typeof results>()
  for (const r of results) {
    const list = byGolfer.get(r.golferId) ?? []
    list.push(r)
    byGolfer.set(r.golferId, list)
  }

  let updated = 0
  for (const [golferId, rs] of byGolfer) {
    const fpts = rs.reduce(
      (sum, r) => sum + calculateGolferPoints(statsFromResult(r), DEFAULT_SCORING),
      0
    )
    const stats: GolferSeasonStats = {
      season,
      events: rs.length,
      wins: rs.filter((r) => r.position === 1).length,
      top10s: rs.filter((r) => r.position != null && r.position <= 10).length,
      cutsMade: rs.filter((r) => !r.isCut).length,
      birdies: rs.reduce((s, r) => s + r.birdies, 0),
      eagles: rs.reduce((s, r) => s + r.eagles, 0),
      fpts: Math.round(fpts),
      avgFpts: rs.length ? Math.round((fpts / rs.length) * 10) / 10 : 0,
    }
    await db.update(golfGolfers).set({ seasonStats: stats }).where(eq(golfGolfers.id, golferId))
    updated++
  }
  return updated
}
