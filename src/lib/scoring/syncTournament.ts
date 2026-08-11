import { eq, and, inArray, or } from 'drizzle-orm'
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import {
  golfTournaments,
  golfGolfers,
  golfTournamentField,
  golfGolferResults,
  golfPools,
  golfPoolEntries,
} from '../db/schema.js'
import { poolIdsForTournament, poolTournamentRows } from '../db/poolTournaments.js'
import { recalculatePool } from './recalculatePool.js'
import { recomputeSeasonStats } from './seasonStats.js'
import { controlDraft } from '../../../api/_draftService.js'
import {
  sgFetch,
  num,
  parsePosition,
  statsFromScorecards,
  type SgLeaderboard,
  type SgScorecardRound,
} from '../../../api/_slashgolf.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = NeonHttpDatabase<any>
type Tournament = typeof golfTournaments.$inferSelect

export interface SyncResult {
  synced: boolean
  reason?: string
  tournamentStatus?: string
  resultsUpserted?: number
  fieldAdded?: number
  unmatchedPlayers?: number
  scorecardCalls?: number
  pools?: number
  entriesRecalculated?: number
}

// One tournament sync pass against SlashGolf. Caller decides WHEN to run
// (throttles, cron windows); this decides WHAT to do. withScorecards
// controls the stat-detail pass (1 API call per picked golfer).
export async function syncTournament(
  db: Db,
  tournament: Tournament,
  opts: { withScorecards: boolean }
): Promise<SyncResult> {
  if (!tournament.externalId) {
    return { synced: false, reason: 'No SlashGolf tournId' }
  }

  const now = new Date()
  const year = tournament.season

  const lb = await sgFetch<SgLeaderboard>(
    `leaderboard?orgId=1&tournId=${tournament.externalId}&year=${year}`
  )
  // Pre-event the leaderboard may already carry the field + tee times
  // with status "Not Started" — process rows whenever they exist.
  if (!lb.leaderboardRows?.length) {
    await db
      .update(golfTournaments)
      .set({ lastSyncedAt: now })
      .where(eq(golfTournaments.id, tournament.id))
    return { synced: true, reason: 'No leaderboard rows yet', resultsUpserted: 0 }
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

  // Every pool that scores this event — not just the ones that START at
  // it. A three-week playoff pool points its own tournamentId at week 1,
  // so a plain tournamentId match would make it INVISIBLE here in weeks
  // 2 and 3: no scorecard pass for its drafted golfers, no rescore, no
  // status update. It would silently freeze on week-1 points.
  // The union also covers pools that predate pool_tournaments.
  const joinedPoolIds = await poolIdsForTournament(db, tournament.id)
  const pools = await db
    .select()
    .from(golfPools)
    .where(
      joinedPoolIds.length > 0
        ? or(
            eq(golfPools.tournamentId, tournament.id),
            inArray(golfPools.id, joinedPoolIds)
          )
        : eq(golfPools.tournamentId, tournament.id)
    )
  const pickedGolferIds = new Set<string>()
  if (pools.length > 0) {
    const entries = await db
      .select({ golferIds: golfPoolEntries.golferIds })
      .from(golfPoolEntries)
      .where(inArray(golfPoolEntries.poolId, pools.map((p) => p.id)))
    for (const e of entries) for (const id of e.golferIds as string[]) pickedGolferIds.add(id)
  }

  const withdrawnRefs: string[] = []
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
    const teeTime = row.teeTime ?? null

    // A withdrawal must stop being draftable immediately — otherwise a
    // live draft can still take a player who is out.
    if (isWithdrawn && !fieldByGolfer.get(golfer.id)?.isWithdrawn) {
      withdrawnRefs.push(golfer.id)
    }

    const fieldRow = fieldByGolfer.get(golfer.id)
    if (!fieldRow) {
      await db.insert(golfTournamentField).values({
        tournamentId: tournament.id,
        golferId: golfer.id,
        isCut,
        isWithdrawn,
        teeTime,
      })
      fieldAdded++
    } else if (
      fieldRow.isCut !== isCut ||
      fieldRow.isWithdrawn !== isWithdrawn ||
      fieldRow.teeTime !== teeTime
    ) {
      await db
        .update(golfTournamentField)
        .set({ isCut, isWithdrawn, teeTime })
        .where(eq(golfTournamentField.id, fieldRow.id))
    }

    // Pre-event (field/tee-time discovery): no scores to record yet.
    if (lb.status === 'Not Started') continue

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
      // Scoring reads this table, not tournament_field — a WD that isn't
      // copied here still collects the made-cut bonus.
      isWithdrawn,
      updatedAt: now,
    }

    if (opts.withScorecards && pickedGolferIds.has(golfer.id)) {
      try {
        const rounds = await sgFetch<SgScorecardRound[]>(
          `scorecard?orgId=1&tournId=${tournament.externalId}&year=${year}&playerId=${row.playerId}`
        )
        scorecardCalls++
        const s = statsFromScorecards(rounds)
        // Persist hole-by-hole for the leaderboard drill-down UI.
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
        Object.assign(values, {
          holeInOnes: s.holeInOnes,
          albatrosses: s.albatrosses,
          eagles: s.eagles,
          birdies: s.birdies,
          pars: s.pars,
          bogeys: s.bogeys,
          doubleBogeys: s.doubleBogeys,
          worseThanDouble: s.worseThanDouble,
          scorecards: stored,
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

  let newStatus = tournament.status
  if (lb.status === 'Official') newStatus = 'completed'
  else if (lb.status !== 'Not Started') newStatus = 'active'

  // Anyone reported cut is proof this event has a cut AND that it has
  // landed. Latches on and never unlatches: positions churn every sync
  // and the bonus must not flicker off once earned. Stays false all week
  // at a no-cut event, which is what stops the playoffs paying it.
  const cutApplied =
    tournament.cutApplied || lb.leaderboardRows.some((r) => r.status === 'cut')

  await db
    .update(golfTournaments)
    .set({
      status: newStatus,
      cutApplied,
      lastSyncedAt: now,
      ...(opts.withScorecards ? { lastFullSyncAt: now } : {}),
    })
    .where(eq(golfTournaments.id, tournament.id))

  let entriesRecalculated = 0
  for (const pool of pools) {
    // Read the pool's whole slate — this event's new status is already
    // persisted above, so these rows are current.
    const events = await poolTournamentRows(db, pool)
    const slate = events.length > 0 ? events : [{ ...tournament, status: newStatus }]

    let poolStatus = pool.status
    if (poolStatus !== 'cancelled') {
      // Finished only when the LAST event is. Completing on this event
      // alone would close a three-week pool after week 1.
      if (slate.every((t) => t.status === 'completed')) poolStatus = 'completed'
      // Locked the moment the FIRST event does — one draft, one roster,
      // riding every event.
      else if (slate.some((t) => now >= t.lockTime)) poolStatus = 'locked'
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

  // Tell any draft on this event that these golfers are out.
  if (withdrawnRefs.length > 0) {
    for (const pool of pools) {
      if (pool.pickMode !== 'draft' || !pool.draftId) continue
      for (const ref of withdrawnRefs) {
        await controlDraft(pool.draftId, {
          action: 'set_available',
          ref,
          available: false,
        }).catch(() => {
          /* a withdrawal that can't be pushed shouldn't fail the sync */
        })
      }
    }
  }

  return {
    synced: true,
    tournamentStatus: newStatus,
    resultsUpserted,
    fieldAdded,
    unmatchedPlayers: unmatched,
    scorecardCalls,
    pools: pools.length,
    entriesRecalculated,
  }
}
