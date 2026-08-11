import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db.js'
import { golfPools, golfPoolEntries, golfGolfers, golfGolferResults, users } from '../../src/lib/db/schema.js'
import { eq, inArray } from 'drizzle-orm'
import { poolTournamentRows } from '../../src/lib/db/poolTournaments.js'

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
        displayName: users.displayName,
      })
      .from(golfPoolEntries)
      .innerJoin(users, eq(golfPoolEntries.userId, users.id))
      .where(eq(golfPoolEntries.poolId, pool.id))
      .orderBy(golfPoolEntries.rank)

    // Every event this pool scores, in play order.
    const slate = await poolTournamentRows(db, pool)
    const tournamentIds = slate.map((t) => t.id)

    // Results for all of them. Keyed by tournament AND golfer: keying on
    // golfer alone made three events of results for the same player
    // overwrite each other, so a three-week pool showed only whichever
    // row happened to come back last.
    const results = tournamentIds.length
      ? await db
          .select()
          .from(golfGolferResults)
          .where(inArray(golfGolferResults.tournamentId, tournamentIds))
      : []
    const resultMap = new Map(results.map((r) => [`${r.tournamentId}:${r.golferId}`, r]))

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
        // One results row per event the golfer actually played; events
        // they didn't advance to are simply absent.
        byTournament: Object.fromEntries(
          tournamentIds
            .map((tid) => [tid, resultMap.get(`${tid}:${gid}`) ?? null])
            .filter(([, r]) => r !== null)
        ),
      })),
    }))

    return res.status(200).json({
      leaderboard,
      pool,
      tournaments: slate.map((t) => ({
        id: t.id,
        name: t.name,
        course: t.course,
        status: t.status,
        startDate: t.startDate,
        endDate: t.endDate,
        timeZone: t.timeZone,
        lastSyncedAt: t.lastSyncedAt,
        // The UI recomputes points client-side, so it needs the same
        // cut state the server scored with or the two will disagree.
        cutApplied: t.cutApplied,
      })),
      // The first event — what the page header and sync line described
      // before pools could span more than one.
      tournament: slate[0] ?? null,
    })
  } catch (error) {
    console.error('GET /api/pools/leaderboard error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
