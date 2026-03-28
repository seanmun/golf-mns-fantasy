import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db'
import { verifyAuth, isAdmin } from '../_middleware'
import { golfPools, golfPoolEntries, golfGolferResults } from '../../src/lib/db/schema'
import { eq } from 'drizzle-orm'
import { calculateGolferPoints, type ScoringConfig, type GolferStats } from '../../src/lib/scoring/engine'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const userId = await verifyAuth(req)
    if (!userId || !isAdmin(userId)) return res.status(403).json({ error: 'Forbidden' })

    const { poolId } = req.body
    if (!poolId) return res.status(400).json({ error: 'poolId is required' })

    const [pool] = await db
      .select()
      .from(golfPools)
      .where(eq(golfPools.id, poolId))
      .limit(1)

    if (!pool) return res.status(404).json({ error: 'Pool not found' })

    const scoringConfig = pool.scoringConfig as ScoringConfig

    // Load all golfer results for this tournament
    const results = await db
      .select()
      .from(golfGolferResults)
      .where(eq(golfGolferResults.tournamentId, pool.tournamentId))

    const resultMap = Object.fromEntries(results.map((r) => [r.golferId, r]))

    // Load all entries
    const entries = await db
      .select()
      .from(golfPoolEntries)
      .where(eq(golfPoolEntries.poolId, poolId))

    // Recalculate each entry
    const updates = entries.map((entry) => {
      const golferIds = entry.golferIds as string[]
      let totalPoints = 0

      for (const golferId of golferIds) {
        const result = resultMap[golferId]
        if (!result) continue

        const stats: GolferStats = {
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

        totalPoints += calculateGolferPoints(stats, scoringConfig)
      }

      return { id: entry.id, totalPoints: String(totalPoints) }
    })

    // Update all entries
    for (const update of updates) {
      await db
        .update(golfPoolEntries)
        .set({ totalPoints: update.totalPoints, updatedAt: new Date() })
        .where(eq(golfPoolEntries.id, update.id))
    }

    // Update ranks
    const sorted = [...updates].sort((a, b) => Number(b.totalPoints) - Number(a.totalPoints))
    for (let i = 0; i < sorted.length; i++) {
      await db
        .update(golfPoolEntries)
        .set({ rank: i + 1 })
        .where(eq(golfPoolEntries.id, sorted[i].id))
    }

    return res.status(200).json({ success: true, updatedEntries: updates.length })
  } catch (error) {
    console.error('POST /api/scoring/recalculate error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
