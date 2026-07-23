import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db.js'
import { verifyAuth, isAdmin } from '../_middleware.js'
import {
  golfTournaments,
  golfGolfers,
  golfTournamentField,
  golfGolferResults,
  golfPools,
  golfPoolEntries,
} from '../../src/lib/db/schema.js'
import { eq, and, inArray } from 'drizzle-orm'
import { recalculatePool } from '../../src/lib/scoring/recalculatePool.js'
import { recomputeSeasonStats } from '../../src/lib/scoring/seasonStats.js'
import {
  sgFetch,
  num,
  parsePosition,
  statsFromScorecards,
  type SgLeaderboard,
  type SgScorecardRound,
} from '../_slashgolf.js'

// Free-tier budget (250 req/month, 20 scorecards/day):
// - leaderboard-only sync (1 call): at most every LEADERBOARD_THROTTLE
// - scorecard pass (1 call per PICKED golfer): at most every SCORECARD_THROTTLE
// Admin force bypasses the leaderboard throttle but still respects the
// scorecard cadence unless the pass is due.
const LEADERBOARD_THROTTLE_MS = 8 * 60 * 60 * 1000 // 8h = max 3 pulls/day (Sean, 2026-07-23)
const SCORECARD_THROTTLE_MS = 20 * 60 * 60 * 1000 // ~daily

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const tournamentId =
      (req.method === 'POST' ? req.body?.tournamentId : req.query.tournamentId) as
        | string
        | undefined
    if (!tournamentId) return res.status(400).json({ error: 'tournamentId is required' })

    const [tournament] = await db
      .select()
      .from(golfTournaments)
      .where(eq(golfTournaments.id, tournamentId))
      .limit(1)
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' })
    if (!tournament.externalId) {
      return res.status(400).json({ error: 'Tournament has no SlashGolf tournId' })
    }
    if (tournament.status === 'completed' || tournament.status === 'cancelled') {
      return res.status(200).json({ synced: false, reason: `Tournament ${tournament.status}` })
    }

    const force = req.query.force === '1' || req.body?.force === true
    let isAdminCaller = false
    if (force) {
      const userId = await verifyAuth(req)
      isAdminCaller = !!userId && isAdmin(userId)
    }
    const now = new Date()
    const last = tournament.lastSyncedAt?.getTime() ?? 0
    if (!(force && isAdminCaller) && now.getTime() - last < LEADERBOARD_THROTTLE_MS) {
      return res.status(200).json({ synced: false, reason: 'Throttled' })
    }
    if (!(force && isAdminCaller) && tournament.status === 'upcoming' && now < tournament.startDate) {
      return res.status(200).json({ synced: false, reason: 'Not started yet' })
    }

    const year = tournament.season
    const lb = await sgFetch<SgLeaderboard>(
      `leaderboard?orgId=1&tournId=${tournament.externalId}&year=${year}`
    )
    if (lb.status === 'Not Started' || !lb.leaderboardRows?.length) {
      await db
        .update(golfTournaments)
        .set({ lastSyncedAt: now })
        .where(eq(golfTournaments.id, tournament.id))
      return res.status(200).json({ synced: true, reason: 'Tournament not started', results: 0 })
    }

    const golfers = await db.select().from(golfGolfers)
    const golferByExternal = new Map(
      golfers.filter((g) => g.externalId).map((g) => [g.externalId!, g])
    )

    const existingField = await db
      .select()
      .from(golfTournamentField)
      .where(eq(golfTournamentField.tournamentId, tournament.id))
    const fieldByGolfer = new Map(existingField.map((f) => [f.golferId, f]))

    // Which golfers are actually picked in pools on this tournament?
    // Scorecards (stat detail) are fetched only for these.
    const pools = await db
      .select()
      .from(golfPools)
      .where(eq(golfPools.tournamentId, tournament.id))
    const pickedGolferIds = new Set<string>()
    if (pools.length > 0) {
      const entries = await db
        .select({ golferIds: golfPoolEntries.golferIds })
        .from(golfPoolEntries)
        .where(inArray(golfPoolEntries.poolId, pools.map((p) => p.id)))
      for (const e of entries) for (const id of e.golferIds as string[]) pickedGolferIds.add(id)
    }

    const scorecardsDue =
      now.getTime() - (tournament.lastFullSyncAt?.getTime() ?? 0) >= SCORECARD_THROTTLE_MS

    let resultsUpserted = 0
    let fieldAdded = 0
    let unmatched = 0
    let scorecardCalls = 0

    for (const row of lb.leaderboardRows) {
      const golfer = golferByExternal.get(String(row.playerId))
      if (!golfer) {
        unmatched++
        continue
      }

      const isCut = row.status === 'cut'
      const isWithdrawn = row.status === 'wd'

      const fieldRow = fieldByGolfer.get(golfer.id)
      if (!fieldRow) {
        await db.insert(golfTournamentField).values({
          tournamentId: tournament.id,
          golferId: golfer.id,
          isCut,
          isWithdrawn,
        })
        fieldAdded++
      } else if (fieldRow.isCut !== isCut || fieldRow.isWithdrawn !== isWithdrawn) {
        await db
          .update(golfTournamentField)
          .set({ isCut, isWithdrawn })
          .where(eq(golfTournamentField.id, fieldRow.id))
      }

      // Base values from the leaderboard (positions + round strokes).
      const roundStrokes = new Map<number, number>()
      for (const r of row.rounds ?? []) {
        const n = num(r.roundId)
        const s = num(r.strokes)
        if (n != null && s != null) roundStrokes.set(n, s)
      }

      const values: Record<string, unknown> = {
        round1Score: roundStrokes.get(1) ?? null,
        round2Score: roundStrokes.get(2) ?? null,
        round3Score: roundStrokes.get(3) ?? null,
        round4Score: roundStrokes.get(4) ?? null,
        totalScore: row.total === 'E' ? 0 : (num(row.total) ?? null),
        position: parsePosition(row.position),
        isCut,
        updatedAt: now,
      }

      // Stat detail from scorecards — picked golfers only, on cadence.
      if (scorecardsDue && pickedGolferIds.has(golfer.id)) {
        try {
          const rounds = await sgFetch<SgScorecardRound[]>(
            `scorecard?orgId=1&tournId=${tournament.externalId}&year=${year}&playerId=${row.playerId}`
          )
          scorecardCalls++
          const s = statsFromScorecards(rounds)
          Object.assign(values, {
            holeInOnes: s.holeInOnes,
            albatrosses: s.albatrosses,
            eagles: s.eagles,
            birdies: s.birdies,
            pars: s.pars,
            bogeys: s.bogeys,
            doubleBogeys: s.doubleBogeys,
            worseThanDouble: s.worseThanDouble,
          })
        } catch (err) {
          console.error(`scorecard failed for ${row.playerId}:`, err)
        }
      }

      const [existing] = await db
        .select({ id: golfGolferResults.id })
        .from(golfGolferResults)
        .where(
          and(
            eq(golfGolferResults.tournamentId, tournament.id),
            eq(golfGolferResults.golferId, golfer.id)
          )
        )
        .limit(1)

      if (existing) {
        await db.update(golfGolferResults).set(values).where(eq(golfGolferResults.id, existing.id))
      } else {
        await db.insert(golfGolferResults).values({
          tournamentId: tournament.id,
          golferId: golfer.id,
          ...values,
        } as typeof golfGolferResults.$inferInsert)
      }
      resultsUpserted++
    }

    // Lifecycle. SlashGolf reports "Official" when the event is final.
    let newStatus = tournament.status
    if (lb.status === 'Official') newStatus = 'completed'
    else newStatus = 'active'

    await db
      .update(golfTournaments)
      .set({
        status: newStatus,
        lastSyncedAt: now,
        ...(scorecardsDue ? { lastFullSyncAt: now } : {}),
      })
      .where(eq(golfTournaments.id, tournament.id))

    let entriesRecalculated = 0
    for (const pool of pools) {
      let poolStatus = pool.status
      if (poolStatus !== 'cancelled') {
        if (newStatus === 'completed') poolStatus = 'completed'
        else if (now >= tournament.lockTime) poolStatus = 'locked'
      }
      if (poolStatus !== pool.status) {
        await db
          .update(golfPools)
          .set({ status: poolStatus, updatedAt: now })
          .where(eq(golfPools.id, pool.id))
      }
      entriesRecalculated += await recalculatePool(db, pool)
    }

    if (newStatus === 'completed' && tournament.status !== 'completed') {
      await recomputeSeasonStats(db, tournament.season)
    }

    return res.status(200).json({
      synced: true,
      source: 'slashgolf',
      tournamentStatus: newStatus,
      resultsUpserted,
      fieldAdded,
      unmatchedPlayers: unmatched,
      scorecardCalls,
      pools: pools.length,
      entriesRecalculated,
    })
  } catch (error) {
    console.error('POST /api/scoring/sync error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
