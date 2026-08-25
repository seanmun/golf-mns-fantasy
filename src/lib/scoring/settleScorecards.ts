import { and, eq, isNull } from 'drizzle-orm'
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import { golfTournaments, golfGolfers, golfGolferResults } from '../db/schema.js'
import { sgFetch, num, statsFromScorecards, type SgScorecardRound } from '../../../api/_slashgolf.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = NeonHttpDatabase<any>
type Tournament = typeof golfTournaments.$inferSelect

// During play, scorecards are fetched only for ROSTERED golfers — one
// API call per golfer per pass, so the whole field is far too expensive
// hourly. That leaves everyone else with no hole data at all, which is
// why a free agent's fantasy points compute to ~0 and why season FPts
// are built from a fraction of the field.
//
// An event only finishes once, so filling the gaps at that moment is the
// cheapest way to get complete data: ~45 calls for a 69-man playoff
// field, ~110 for a full-field event, once, ever.
//
// Capped per invocation. 100+ sequential HTTP calls in one serverless
// function is how the golfer sync silently stopped at 895 of 998 — this
// converges over consecutive hourly runs instead.
export const SETTLE_BATCH = 25

export interface SettleResult {
  attempted: number
  filled: number
  remaining: number
}

export async function settleScorecards(
  db: Db,
  tournament: Tournament,
  limit = SETTLE_BATCH
): Promise<SettleResult> {
  if (!tournament.externalId) return { attempted: 0, filled: 0, remaining: 0 }

  const missing = await db
    .select({
      id: golfGolferResults.id,
      golferId: golfGolferResults.golferId,
      externalId: golfGolfers.externalId,
    })
    .from(golfGolferResults)
    .innerJoin(golfGolfers, eq(golfGolferResults.golferId, golfGolfers.id))
    .where(
      and(
        eq(golfGolferResults.tournamentId, tournament.id),
        isNull(golfGolferResults.scorecards)
      )
    )

  const batch = missing.slice(0, limit)
  let filled = 0

  for (const row of batch) {
    if (!row.externalId) continue
    try {
      const rounds = await sgFetch<SgScorecardRound[]>(
        `scorecard?orgId=1&tournId=${tournament.externalId}&year=${tournament.season}&playerId=${row.externalId}`
      )
      const s = statsFromScorecards(rounds)
      const stored = rounds
        .map((r) => {
          const holes: Record<string, { score: number; par: number }> = {}
          let strokes = 0
          for (const [k, h] of Object.entries(r.holes ?? {})) {
            const score = num(h.holeScore)
            const par = num(h.par)
            if (score == null || par == null) continue
            holes[k] = { score, par }
            strokes += score
          }
          return { round: num(r.roundId) ?? 0, holes, strokes }
        })
        .filter((r) => r.round > 0 && Object.keys(r.holes).length > 0)
        .sort((a, b) => a.round - b.round)

      // A golfer who withdrew after one round has a real but partial
      // card. Storing an empty array would make this row look settled
      // forever while carrying no data — leave it null to retry.
      if (stored.length === 0) continue

      await db
        .update(golfGolferResults)
        .set({
          holeInOnes: s.holeInOnes,
          albatrosses: s.albatrosses,
          eagles: s.eagles,
          birdies: s.birdies,
          pars: s.pars,
          bogeys: s.bogeys,
          doubleBogeys: s.doubleBogeys,
          worseThanDouble: s.worseThanDouble,
          scorecards: stored,
          updatedAt: new Date(),
        })
        .where(eq(golfGolferResults.id, row.id))
      filled++
    } catch (err) {
      // One bad player must not stop the batch; the next run retries it.
      console.error(`settle scorecard failed for ${row.externalId}:`, err)
    }
  }

  return { attempted: batch.length, filled, remaining: missing.length - filled }
}
