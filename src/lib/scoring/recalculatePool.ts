import { eq, inArray } from 'drizzle-orm'
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import { golfPools, golfPoolEntries, golfGolferResults } from '../db/schema.js'
import { poolTournamentRows } from '../db/poolTournaments.js'
import { rostersForPool, rosterFor } from '../db/entryRosters.js'
import { calculateGolferPoints, type ScoringConfig, type GolferStats } from './engine.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = NeonHttpDatabase<any>

// Both flags belong to the TOURNAMENT, not the result row: whether its
// cut has happened, and whether it is over. Named rather than positional
// so two booleans can never be passed in the wrong order.
export interface EventState {
  cutApplied: boolean
  eventFinal: boolean
}

export function statsFromResult(
  result: typeof golfGolferResults.$inferSelect,
  event: EventState
): GolferStats {
  return {
    hole_in_ones: result.holeInOnes,
    albatrosses: result.albatrosses,
    eagles: result.eagles,
    birdies: result.birdies,
    pars: result.pars,
    bogeys: result.bogeys,
    double_bogeys: result.doubleBogeys,
    worse_than_double: result.worseThanDouble,
    is_cut: result.isCut,
    is_withdrawn: result.isWithdrawn,
    cut_applied: event.cutApplied,
    event_final: event.eventFinal,
    position: result.position,
  }
}

// Recompute totals + ranks for one pool. Returns updated entry count.
//
// A multi-week pool sums every event it scores: a golfer who plays all
// three playoff events has three result rows and earns each event's
// hole points, made-cut bonus and finish bonus. One who misses the cut
// at event 1 simply has no rows for events 2 and 3 and stops scoring.
export async function recalculatePool(
  db: Db,
  pool: typeof golfPools.$inferSelect
): Promise<number> {
  const scoringConfig = pool.scoringConfig as ScoringConfig

  const events = await poolTournamentRows(db, pool)
  const tournamentIds = events.map((t) => t.id)
  const stateBy = new Map<string, EventState>(
    events.map((t) => [
      t.id,
      { cutApplied: t.cutApplied, eventFinal: t.status === 'completed' },
    ])
  )
  const results = await db
    .select()
    .from(golfGolferResults)
    .where(inArray(golfGolferResults.tournamentId, tournamentIds))
  // Keyed by golfer, but a LIST — one entry per event they played.
  // Deduped by event first: golfer_results has no unique constraint on
  // (tournament_id, golfer_id), and summing a list would turn a stray
  // duplicate row into double points rather than quietly ignoring it.
  const perEvent = new Map<string, typeof golfGolferResults.$inferSelect>()
  for (const r of results) {
    const key = `${r.tournamentId}:${r.golferId}`
    const seen = perEvent.get(key)
    if (!seen || r.updatedAt > seen.updatedAt) perEvent.set(key, r)
  }
  const byGolfer = new Map<string, Array<typeof golfGolferResults.$inferSelect>>()
  for (const r of perEvent.values()) {
    const list = byGolfer.get(r.golferId) ?? []
    list.push(r)
    byGolfer.set(r.golferId, list)
  }

  const entries = await db
    .select()
    .from(golfPoolEntries)
    .where(eq(golfPoolEntries.poolId, pool.id))

  // Score each event against the roster that was in force FOR THAT
  // EVENT, not the team's current list. A golfer dropped after event 1
  // keeps his event-1 points and earns nothing after; one added by
  // waiver earns nothing before he arrived.
  const rosters = await rostersForPool(db, pool.id, tournamentIds)

  const updates = entries.map((entry) => {
    let totalPoints = 0
    for (const tournamentId of tournamentIds) {
      const state = stateBy.get(tournamentId) ?? { cutApplied: false, eventFinal: false }
      for (const golferId of rosterFor(rosters, entry.id, tournamentId)) {
        const result = (byGolfer.get(golferId) ?? []).find(
          (r) => r.tournamentId === tournamentId
        )
        if (!result) continue
        totalPoints += calculateGolferPoints(statsFromResult(result, state), scoringConfig)
      }
    }
    return { id: entry.id, totalPoints: String(Math.round(totalPoints * 100) / 100) }
  })

  for (const update of updates) {
    await db
      .update(golfPoolEntries)
      .set({ totalPoints: update.totalPoints, updatedAt: new Date() })
      .where(eq(golfPoolEntries.id, update.id))
  }

  const sorted = [...updates].sort((a, b) => Number(b.totalPoints) - Number(a.totalPoints))
  for (let i = 0; i < sorted.length; i++) {
    await db
      .update(golfPoolEntries)
      .set({ rank: i + 1 })
      .where(eq(golfPoolEntries.id, sorted[i].id))
  }

  return updates.length
}
