import { and, asc, count, desc, eq, inArray } from 'drizzle-orm'
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import {
  golfPools,
  golfPoolEntries,
  golfTournaments,
  golfTournamentField,
  golfGolfers,
  golfWaiverClaims,
  users,
} from '../db/schema.js'
import { poolTournamentRows } from '../db/poolTournaments.js'
import { rostersForPool, rosterFor, writeRosters } from '../db/entryRosters.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = NeonHttpDatabase<any>
type Pool = typeof golfPools.$inferSelect
type Tournament = typeof golfTournaments.$inferSelect

// Claims are processed 24h before the upcoming event locks. Everything
// downstream derives from that one number, so there is no separate
// schedule to keep in sync with the calendar: events lock the morning
// of round 1, which puts processing on the Wednesday.
const PROCESS_LEAD_MS = 24 * 60 * 60 * 1000

export interface WaiverWindow {
  // The event this window feeds — the next one to be played.
  tournament: Tournament | null
  // Events already played, whose rosters must never be rewritten.
  playedTournamentIds: string[]
  // The upcoming event plus everything after it.
  futureTournamentIds: string[]
  opensAt: Date | null
  processAt: Date | null
  isOpen: boolean
  // Why it isn't open, for the UI to say something useful.
  reason?: string
}

// Which event a pool's waiver window currently feeds, and whether it is
// open. A window exists only between events: it opens when the previous
// one goes final (that is when the next field is known and teams can see
// who was eliminated) and shuts 24h before the next one locks.
export async function waiverWindowFor(db: Db, pool: Pool): Promise<WaiverWindow> {
  const events = await poolTournamentRows(db, pool)
  const empty: WaiverWindow = {
    tournament: null,
    playedTournamentIds: [],
    futureTournamentIds: [],
    opensAt: null,
    processAt: null,
    isOpen: false,
  }

  if (events.length < 2) {
    return { ...empty, reason: 'This pool is a single event — there are no waivers.' }
  }

  const now = new Date()
  const upcomingIndex = events.findIndex((t) => t.status !== 'completed')
  if (upcomingIndex <= 0) {
    return {
      ...empty,
      playedTournamentIds: events.filter((t) => t.status === 'completed').map((t) => t.id),
      reason:
        upcomingIndex === 0
          ? 'Waivers open once the first event is final.'
          : 'Every event in this pool is finished.',
    }
  }

  const tournament = events[upcomingIndex]
  const previous = events[upcomingIndex - 1]
  const playedTournamentIds = events.slice(0, upcomingIndex).map((t) => t.id)
  const futureTournamentIds = events.slice(upcomingIndex).map((t) => t.id)
  const processAt = new Date(tournament.lockTime.getTime() - PROCESS_LEAD_MS)

  const base = {
    tournament,
    playedTournamentIds,
    futureTournamentIds,
    opensAt: null as Date | null,
    processAt,
  }

  if (previous.status !== 'completed') {
    return { ...base, isOpen: false, reason: `Waivers open when ${previous.name} is final.` }
  }
  if (now >= processAt) {
    return { ...base, isOpen: false, reason: 'Waivers for this event have closed.' }
  }
  // The field for the upcoming event has to exist or there is nobody to
  // claim. It publishes once the previous event decides who advanced.
  const [fieldSize] = await db
    .select({ value: count() })
    .from(golfTournamentField)
    .where(eq(golfTournamentField.tournamentId, tournament.id))
  if (!fieldSize?.value) {
    return {
      ...base,
      isOpen: false,
      reason: `The ${tournament.name} field hasn't been published yet.`,
    }
  }

  return { ...base, isOpen: true }
}

// Golfers playing the upcoming event who nobody in this pool holds.
export async function freeAgentsFor(db: Db, pool: Pool, tournamentId: string) {
  const field = await db
    .select({
      id: golfGolfers.id,
      name: golfGolfers.name,
      country: golfGolfers.country,
      worldRanking: golfGolfers.worldRanking,
      seasonStats: golfGolfers.seasonStats,
      teeTime: golfTournamentField.teeTime,
    })
    .from(golfTournamentField)
    .innerJoin(golfGolfers, eq(golfTournamentField.golferId, golfGolfers.id))
    .where(
      and(
        eq(golfTournamentField.tournamentId, tournamentId),
        eq(golfTournamentField.isWithdrawn, false)
      )
    )

  const taken = await rosteredGolferIds(db, pool.id, tournamentId)
  return field
    .filter((g) => !taken.has(g.id))
    .sort((a, b) => {
      const ra = a.worldRanking ?? Number.MAX_SAFE_INTEGER
      const rb = b.worldRanking ?? Number.MAX_SAFE_INTEGER
      return ra !== rb ? ra - rb : a.name.localeCompare(b.name)
    })
}

async function rosteredGolferIds(db: Db, poolId: string, tournamentId: string) {
  const rosters = await rostersForPool(db, poolId, [tournamentId])
  const taken = new Set<string>()
  for (const byTournament of rosters.values()) {
    for (const id of byTournament.get(tournamentId) ?? []) taken.add(id)
  }
  return taken
}

export interface ProcessResult {
  processed: boolean
  reason?: string
  tournament?: string
  granted: Array<{ team: string; added: string; dropped: string }>
  failed: Array<{ team: string; reason: string }>
}

// Run every pending claim for a pool's current window, in priority
// order. Idempotent: claims are marked as they are handled, so a second
// run finds nothing pending.
export async function processWaivers(
  db: Db,
  pool: Pool,
  opts: { force?: boolean; dryRun?: boolean } = {}
): Promise<ProcessResult> {
  const window = await waiverWindowFor(db, pool)
  const out: ProcessResult = { processed: false, granted: [], failed: [] }
  if (!window.tournament) return { ...out, reason: window.reason ?? 'No upcoming event' }

  const now = new Date()
  if (!opts.force && window.processAt && now < window.processAt) {
    return { ...out, reason: `Not due until ${window.processAt.toISOString()}` }
  }

  const claims = await db
    .select()
    .from(golfWaiverClaims)
    .where(
      and(
        eq(golfWaiverClaims.poolId, pool.id),
        eq(golfWaiverClaims.tournamentId, window.tournament.id),
        eq(golfWaiverClaims.status, 'pending')
      )
    )
  if (claims.length === 0) {
    return { ...out, processed: true, tournament: window.tournament.name, reason: 'No claims' }
  }

  // Priority: highest score first. Ties break on who joined earlier, so
  // the order is deterministic and never depends on row order.
  const entries = await db
    .select({
      id: golfPoolEntries.id,
      userId: golfPoolEntries.userId,
      totalPoints: golfPoolEntries.totalPoints,
      createdAt: golfPoolEntries.createdAt,
    })
    .from(golfPoolEntries)
    .where(eq(golfPoolEntries.poolId, pool.id))
    .orderBy(desc(golfPoolEntries.totalPoints), asc(golfPoolEntries.createdAt))

  const claimByEntry = new Map(claims.map((c) => [c.entryId, c]))
  const taken = await rosteredGolferIds(db, pool.id, window.tournament.id)
  const fieldIds = new Set(
    (
      await db
        .select({ golferId: golfTournamentField.golferId })
        .from(golfTournamentField)
        .where(
          and(
            eq(golfTournamentField.tournamentId, window.tournament.id),
            eq(golfTournamentField.isWithdrawn, false)
          )
        )
    ).map((f) => f.golferId)
  )

  const names = await golferNames(db, [
    ...taken,
    ...claims.flatMap((c) => [...(c.addGolferIds as string[]), c.dropGolferId]),
  ])
  // Team names live on users; looking them up in the golfer map would
  // silently fall through to a truncated uuid for every team.
  const teamNames = new Map(
    (
      await db
        .select({ id: users.id, displayName: users.displayName })
        .from(users)
        .where(inArray(users.id, entries.map((e) => e.userId)))
    ).map((u) => [u.id, u.displayName])
  )
  const rosters = await rostersForPool(db, pool.id, window.futureTournamentIds)

  for (const entry of entries) {
    const claim = claimByEntry.get(entry.id)
    if (!claim) continue
    const teamName = teamNames.get(entry.userId) ?? entry.id.slice(0, 8)

    const current = rosterFor(rosters, entry.id, window.tournament.id)
    if (!current.includes(claim.dropGolferId)) {
      if (!opts.dryRun) {
        await failClaim(db, claim.id, 'The golfer to drop is no longer on your roster')
      }
      out.failed.push({ team: teamName, reason: 'drop golfer not on roster' })
      continue
    }

    // First choice still free wins. Being outbid on your top pick should
    // cost you that golfer, not your whole transaction.
    const pick = (claim.addGolferIds as string[]).find(
      (gid) => !taken.has(gid) && fieldIds.has(gid)
    )
    if (!pick) {
      if (!opts.dryRun) {
        await failClaim(db, claim.id, 'Every golfer you listed was taken by a higher-priority team')
      }
      out.failed.push({ team: teamName, reason: 'all choices taken' })
      continue
    }

    const next = [...current.filter((g) => g !== claim.dropGolferId), pick]
    if (!opts.dryRun) {
      // Only the upcoming event and everything after it. Rewriting a
      // played event would retroactively change a finished result.
      await writeRosters(db, entry.id, window.futureTournamentIds, next, {
        addedAt: now,
        onlyGolferIds: [pick],
      })
      await db
        .update(golfPoolEntries)
        .set({ golferIds: next, updatedAt: now })
        .where(eq(golfPoolEntries.id, entry.id))
      await db
        .update(golfWaiverClaims)
        .set({ status: 'granted', grantedGolferId: pick, processedAt: now, updatedAt: now })
        .where(eq(golfWaiverClaims.id, claim.id))
    }

    // Tracked either way: a dry run must model contention exactly as the
    // real one does, or it reports outcomes that cannot happen.
    taken.add(pick)

    out.granted.push({
      team: teamName,
      added: names.get(pick) ?? pick,
      dropped: names.get(claim.dropGolferId) ?? claim.dropGolferId,
    })
  }

  return { ...out, processed: true, tournament: window.tournament.name }
}

async function failClaim(db: Db, claimId: string, reason: string) {
  await db
    .update(golfWaiverClaims)
    .set({ status: 'failed', failureReason: reason, processedAt: new Date(), updatedAt: new Date() })
    .where(eq(golfWaiverClaims.id, claimId))
}

async function golferNames(db: Db, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].filter(Boolean)
  if (unique.length === 0) return new Map()
  const rows = await db
    .select({ id: golfGolfers.id, name: golfGolfers.name })
    .from(golfGolfers)
    .where(inArray(golfGolfers.id, unique))
  return new Map(rows.map((r) => [r.id, r.name]))
}
