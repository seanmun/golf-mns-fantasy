import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db.js'
import { golfPools, golfPoolEntries, golfGolfers, golfGolferResults, golfUsers } from '../../src/lib/db/schema.js'
import { eq, inArray } from 'drizzle-orm'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { poolId } = req.query

    const [pool] = await db
      .select()
      .from(golfPools)
      .where(eq(golfPools.id, poolId as string))
      .limit(1)

    if (!pool) return res.status(404).json({ error: 'Pool not found' })

    const entries = await db
      .select({
        id: golfPoolEntries.id,
        userId: golfPoolEntries.userId,
        golferIds: golfPoolEntries.golferIds,
        totalPoints: golfPoolEntries.totalPoints,
        rank: golfPoolEntries.rank,
        submittedAt: golfPoolEntries.submittedAt,
        displayName: golfUsers.displayName,
      })
      .from(golfPoolEntries)
      .innerJoin(golfUsers, eq(golfPoolEntries.userId, golfUsers.id))
      .where(eq(golfPoolEntries.poolId, pool.id))
      .orderBy(golfPoolEntries.rank)

    // Get all golfer results for this tournament
    const results = await db
      .select()
      .from(golfGolferResults)
      .where(eq(golfGolferResults.tournamentId, pool.tournamentId))

    const resultMap = Object.fromEntries(results.map((r) => [r.golferId, r]))

    // Get all golfer names
    const allGolferIds = [...new Set(entries.flatMap((e) => e.golferIds as string[]))]
    const golfers = allGolferIds.length
      ? await db.select().from(golfGolfers).where(inArray(golfGolfers.id, allGolferIds))
      : []
    const golferMap = Object.fromEntries(golfers.map((g) => [g.id, g]))

    const leaderboard = entries.map((entry) => ({
      ...entry,
      golfers: (entry.golferIds as string[]).map((gid) => ({
        golfer: golferMap[gid] || null,
        results: resultMap[gid] || null,
      })),
    }))

    return res.status(200).json({ leaderboard, pool })
  } catch (error) {
    console.error('GET /api/pools/leaderboard error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
