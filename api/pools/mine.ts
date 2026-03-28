import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db'
import { verifyAuth } from '../_middleware'
import { golfPools, golfPoolEntries, golfTournaments } from '../../src/lib/db/schema'
import { eq } from 'drizzle-orm'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const userId = await verifyAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })

    const entries = await db
      .select({
        poolId: golfPoolEntries.poolId,
        totalPoints: golfPoolEntries.totalPoints,
        rank: golfPoolEntries.rank,
        golferIds: golfPoolEntries.golferIds,
        poolName: golfPools.name,
        poolStatus: golfPools.status,
        tournamentName: golfTournaments.name,
        tournamentStatus: golfTournaments.status,
      })
      .from(golfPoolEntries)
      .innerJoin(golfPools, eq(golfPoolEntries.poolId, golfPools.id))
      .innerJoin(golfTournaments, eq(golfPools.tournamentId, golfTournaments.id))
      .where(eq(golfPoolEntries.userId, userId))

    const pools = entries.map((e) => ({
      id: e.poolId,
      name: e.poolName,
      status: e.poolStatus,
      tournamentName: e.tournamentName,
      tournamentStatus: e.tournamentStatus,
      totalPoints: e.totalPoints,
      rank: e.rank,
      picksCount: (e.golferIds as string[]).length,
    }))

    return res.status(200).json({ pools })
  } catch (error) {
    console.error('GET /api/pools/mine error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
