import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db.js'
import { verifyAuth } from '../_middleware.js'
import { golfPools, golfPoolEntries, golfTournaments } from '../../src/lib/db/schema.js'
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
        tournamentStartDate: golfTournaments.startDate,
        tournamentEndDate: golfTournaments.endDate,
      })
      .from(golfPoolEntries)
      .innerJoin(golfPools, eq(golfPoolEntries.poolId, golfPools.id))
      .innerJoin(golfTournaments, eq(golfPools.tournamentId, golfTournaments.id))
      .where(eq(golfPoolEntries.userId, userId))
      // Soonest event first; in-progress and upcoming events lead.
      .orderBy(golfTournaments.startDate)

    const pools = entries.map((e) => ({
      id: e.poolId,
      name: e.poolName,
      status: e.poolStatus,
      tournamentName: e.tournamentName,
      tournamentStatus: e.tournamentStatus,
      tournamentStartDate: e.tournamentStartDate?.toISOString() ?? null,
      tournamentEndDate: e.tournamentEndDate?.toISOString() ?? null,
      totalPoints: e.totalPoints,
      rank: e.rank,
      picksCount: (e.golferIds as string[]).length,
    }))

    // Live/upcoming events first (soonest first), finished events after
    // (most recent first).
    const rank = (p: (typeof pools)[number]) =>
      p.tournamentStatus === 'completed' ? 1 : 0
    const time = (d: string | null) => (d ? new Date(d).getTime() : 0)
    pools.sort((a, b) => {
      const ra = rank(a)
      const rb = rank(b)
      if (ra !== rb) return ra - rb
      return ra === 1
        ? time(b.tournamentStartDate) - time(a.tournamentStartDate)
        : time(a.tournamentStartDate) - time(b.tournamentStartDate)
    })

    return res.status(200).json({ pools })
  } catch (error) {
    console.error('GET /api/pools/mine error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
