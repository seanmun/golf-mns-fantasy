import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db.js'
import { verifyAuth, isAdmin } from '../_middleware.js'
import {
  golfTournaments,
  golfGolfers,
  golfTournamentField,
  golfGolferResults,
  golfPools,
} from '../../src/lib/db/schema.js'
import { eq, and } from 'drizzle-orm'
import { recalculatePool } from '../../src/lib/scoring/recalculatePool.js'

// Minimum gap between real sportsdata pulls per tournament. The
// leaderboard page fire-and-forgets this endpoint on its 60s refresh;
// the throttle makes actual API traffic ~1 call / 4 min regardless of
// how many viewers are watching. Admins (or ?force=1 from an admin) skip
// the throttle.
const SYNC_THROTTLE_MS = 4 * 60 * 1000

interface SdRound {
  Number: number
  Score: number | null
}

interface SdPlayer {
  PlayerID: number
  Rank: number | null
  MadeCut: number | boolean
  IsWithdrawn: boolean
  HoleInOnes: number
  DoubleEagles: number
  Eagles: number
  Birdies: number
  Pars: number
  Bogeys: number
  DoubleBogeys: number
  WorseThanDoubleBogey: number
  TotalScore: number | null
  Rounds: SdRound[]
}

interface SdLeaderboard {
  Tournament: { IsInProgress: boolean; IsOver: boolean }
  Players: SdPlayer[]
}

// Trial-tier sportsdata keys scramble numeric fields with decimal noise;
// rounding restores usable integers (and is a no-op on real data).
const int = (v: number | null | undefined) => Math.round(Number(v ?? 0))

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
      return res.status(400).json({ error: 'Tournament has no sportsdata externalId' })
    }
    if (tournament.status === 'completed' || tournament.status === 'cancelled') {
      return res.status(200).json({ synced: false, reason: `Tournament ${tournament.status}` })
    }

    // Throttle: only admins force through it.
    const force = req.query.force === '1' || req.body?.force === true
    let isAdminCaller = false
    if (force) {
      const userId = await verifyAuth(req)
      isAdminCaller = !!userId && isAdmin(userId)
    }
    const last = tournament.lastSyncedAt?.getTime() ?? 0
    if (!(force && isAdminCaller) && Date.now() - last < SYNC_THROTTLE_MS) {
      return res.status(200).json({ synced: false, reason: 'Throttled' })
    }

    // Don't bother syncing before the tournament window opens.
    const now = new Date()
    if (tournament.status === 'upcoming' && now < tournament.startDate) {
      // Still allow field population runs on the eve via admin force.
      if (!(force && isAdminCaller)) {
        return res.status(200).json({ synced: false, reason: 'Not started yet' })
      }
    }

    const apiKey = process.env.GOLF_API_KEY
    const baseUrl = process.env.GOLF_API_BASE_URL || 'https://api.sportsdata.io/golf/v2/json'
    if (!apiKey) return res.status(500).json({ error: 'GOLF_API_KEY not configured' })

    const lbRes = await fetch(`${baseUrl}/Leaderboard/${tournament.externalId}?key=${apiKey}`)
    if (!lbRes.ok) {
      return res.status(502).json({ error: `SportsData Leaderboard returned ${lbRes.status}` })
    }
    const lb: SdLeaderboard = await lbRes.json()

    // Map sportsdata PlayerID -> our golfer row
    const golfers = await db.select().from(golfGolfers)
    const golferByExternal = new Map(
      golfers.filter((g) => g.externalId).map((g) => [g.externalId!, g])
    )

    let resultsUpserted = 0
    let fieldAdded = 0
    let unmatched = 0

    // The cut only exists once round 3 has begun (or the event ended);
    // before that, a falsy MadeCut just means "not decided yet".
    const cutApplied =
      lb.Tournament.IsOver ||
      lb.Players.some((p) => p.Rounds?.some((r) => r.Number >= 3 && r.Score != null))

    const existingField = await db
      .select()
      .from(golfTournamentField)
      .where(eq(golfTournamentField.tournamentId, tournament.id))
    const fieldByGolfer = new Map(existingField.map((f) => [f.golferId, f]))

    for (const p of lb.Players) {
      const golfer = golferByExternal.get(String(p.PlayerID))
      if (!golfer) {
        unmatched++
        continue
      }

      const madeCut = Number(p.MadeCut) >= 0.5
      const isCut = cutApplied && !madeCut
      const isWithdrawn = !!p.IsWithdrawn

      // Field membership
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

      // Round scores by round number
      const roundScore = (n: number): number | null => {
        const r = p.Rounds?.find((x) => x.Number === n)
        return r?.Score != null ? int(r.Score) : null
      }

      const values = {
        round1Score: roundScore(1),
        round2Score: roundScore(2),
        round3Score: roundScore(3),
        round4Score: roundScore(4),
        totalScore: p.TotalScore != null ? int(p.TotalScore) : null,
        position: p.Rank != null ? int(p.Rank) : null,
        isCut,
        holeInOnes: int(p.HoleInOnes),
        albatrosses: int(p.DoubleEagles),
        eagles: int(p.Eagles),
        birdies: int(p.Birdies),
        pars: int(p.Pars),
        bogeys: int(p.Bogeys),
        doubleBogeys: int(p.DoubleBogeys),
        worseThanDouble: int(p.WorseThanDoubleBogey),
        updatedAt: new Date(),
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
        })
      }
      resultsUpserted++
    }

    // Lifecycle transitions
    let newStatus = tournament.status
    if (lb.Tournament.IsOver) newStatus = 'completed'
    else if (lb.Tournament.IsInProgress) newStatus = 'active'

    await db
      .update(golfTournaments)
      .set({ status: newStatus, lastSyncedAt: new Date() })
      .where(eq(golfTournaments.id, tournament.id))

    // Pools: lock past lockTime, complete when tournament is over,
    // and recalculate scores.
    const pools = await db
      .select()
      .from(golfPools)
      .where(eq(golfPools.tournamentId, tournament.id))

    let entriesRecalculated = 0
    for (const pool of pools) {
      let poolStatus = pool.status
      if (poolStatus !== 'cancelled') {
        if (lb.Tournament.IsOver) poolStatus = 'completed'
        else if (now >= tournament.lockTime) poolStatus = 'locked'
      }
      if (poolStatus !== pool.status) {
        await db
          .update(golfPools)
          .set({ status: poolStatus, updatedAt: new Date() })
          .where(eq(golfPools.id, pool.id))
      }
      entriesRecalculated += await recalculatePool(db, pool)
    }

    return res.status(200).json({
      synced: true,
      tournamentStatus: newStatus,
      resultsUpserted,
      fieldAdded,
      unmatchedPlayers: unmatched,
      pools: pools.length,
      entriesRecalculated,
    })
  } catch (error) {
    console.error('POST /api/scoring/sync error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
