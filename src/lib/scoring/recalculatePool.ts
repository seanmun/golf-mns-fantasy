import { eq } from 'drizzle-orm'
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import { golfPools, golfPoolEntries, golfGolferResults } from '../db/schema.js'
import { calculateGolferPoints, type ScoringConfig, type GolferStats } from './engine.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = NeonHttpDatabase<any>

export function statsFromResult(result: typeof golfGolferResults.$inferSelect): GolferStats {
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
    position: result.position,
  }
}

// Recompute totals + ranks for one pool. Returns updated entry count.
export async function recalculatePool(
  db: Db,
  pool: typeof golfPools.$inferSelect
): Promise<number> {
  const scoringConfig = pool.scoringConfig as ScoringConfig

  const results = await db
    .select()
    .from(golfGolferResults)
    .where(eq(golfGolferResults.tournamentId, pool.tournamentId))
  const resultMap = Object.fromEntries(results.map((r) => [r.golferId, r]))

  const entries = await db
    .select()
    .from(golfPoolEntries)
    .where(eq(golfPoolEntries.poolId, pool.id))

  const updates = entries.map((entry) => {
    const golferIds = entry.golferIds as string[]
    let totalPoints = 0
    for (const golferId of golferIds) {
      const result = resultMap[golferId]
      if (!result) continue
      totalPoints += calculateGolferPoints(statsFromResult(result), scoringConfig)
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
