import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db.js'
import { verifyAuth } from '../_middleware.js'
import {
  golfPools,
  golfPoolEntries,
  golfTournaments,
  golfPoolTournaments,
} from '../../src/lib/db/schema.js'
import { eq, inArray } from 'drizzle-orm'

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

    // How many events each pool spans, and when the LAST one ends — a
    // three-week pool is still live long after its first event is final.
    const poolIds = entries.map((e) => e.poolId)
    const slates = poolIds.length
      ? await db
          .select({
            poolId: golfPoolTournaments.poolId,
            endDate: golfTournaments.endDate,
          })
          .from(golfPoolTournaments)
          .innerJoin(golfTournaments, eq(golfPoolTournaments.tournamentId, golfTournaments.id))
          .where(inArray(golfPoolTournaments.poolId, poolIds))
      : []
    const eventCount = new Map<string, number>()
    const lastEnd = new Map<string, Date>()
    for (const s of slates) {
      eventCount.set(s.poolId, (eventCount.get(s.poolId) ?? 0) + 1)
      const seen = lastEnd.get(s.poolId)
      if (!seen || s.endDate > seen) lastEnd.set(s.poolId, s.endDate)
    }

    const pools = entries.map((e) => ({
      id: e.poolId,
      name: e.poolName,
      status: e.poolStatus,
      tournamentName: e.tournamentName,
      tournamentStatus: e.tournamentStatus,
      tournamentStartDate: e.tournamentStartDate?.toISOString() ?? null,
      // The end of the whole slate, not just the first event.
      tournamentEndDate:
        (lastEnd.get(e.poolId) ?? e.tournamentEndDate)?.toISOString() ?? null,
      eventCount: eventCount.get(e.poolId) ?? 1,
      totalPoints: e.totalPoints,
      rank: e.rank,
      picksCount: (e.golferIds as string[]).length,
    }))

    // Live/upcoming events first (soonest first), finished events after
    // (most recent first). A multi-week pool counts as finished only when
    // the sync has closed it — its first event going final doesn't.
    const rank = (p: (typeof pools)[number]) =>
      p.status === 'completed' || (p.eventCount === 1 && p.tournamentStatus === 'completed')
        ? 1
        : 0
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
