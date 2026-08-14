import { and, eq, inArray } from 'drizzle-orm'
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import { golfPoolEntries, golfPoolEntryRosters } from './schema.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = NeonHttpDatabase<any>

// entryId -> tournamentId -> golferIds rostered for that event.
export type RosterMap = Map<string, Map<string, string[]>>

// Who counted for each team at each event.
//
// Falls back to pool_entries.golferIds for any entry with no roster rows
// — pools that predate the table, or one whose backfill hasn't run. That
// reproduces the old flat-list behaviour exactly rather than scoring
// them zero, which is the failure mode that actually hurts.
export async function rostersForPool(
  db: Db,
  poolId: string,
  tournamentIds: string[]
): Promise<RosterMap> {
  const entries = await db
    .select({ id: golfPoolEntries.id, golferIds: golfPoolEntries.golferIds })
    .from(golfPoolEntries)
    .where(eq(golfPoolEntries.poolId, poolId))

  const out: RosterMap = new Map()
  if (entries.length === 0) return out

  const rows = await db
    .select({
      entryId: golfPoolEntryRosters.entryId,
      tournamentId: golfPoolEntryRosters.tournamentId,
      golferId: golfPoolEntryRosters.golferId,
    })
    .from(golfPoolEntryRosters)
    .where(inArray(golfPoolEntryRosters.entryId, entries.map((e) => e.id)))

  const seen = new Set<string>()
  for (const r of rows) {
    seen.add(r.entryId)
    let byTournament = out.get(r.entryId)
    if (!byTournament) {
      byTournament = new Map()
      out.set(r.entryId, byTournament)
    }
    byTournament.set(r.tournamentId, [...(byTournament.get(r.tournamentId) ?? []), r.golferId])
  }

  for (const e of entries) {
    if (seen.has(e.id)) continue
    const flat = (e.golferIds as string[]) ?? []
    const byTournament = new Map<string, string[]>()
    for (const tid of tournamentIds) byTournament.set(tid, flat)
    out.set(e.id, byTournament)
  }

  return out
}

// The roster for one entry at one event, with the same fallback.
export function rosterFor(
  rosters: RosterMap,
  entryId: string,
  tournamentId: string
): string[] {
  return rosters.get(entryId)?.get(tournamentId) ?? []
}

// Write a team's roster for a set of events. Used when a draft finishes
// (all events at once) and when a waiver rewrites the events still to
// come. Never touches events already played.
export async function writeRosters(
  db: Db,
  entryId: string,
  tournamentIds: string[],
  golferIds: string[],
  opts: { addedAt?: Date; onlyGolferIds?: string[] } = {}
): Promise<void> {
  if (tournamentIds.length === 0) return
  await db
    .delete(golfPoolEntryRosters)
    .where(
      and(
        eq(golfPoolEntryRosters.entryId, entryId),
        inArray(golfPoolEntryRosters.tournamentId, tournamentIds)
      )
    )
  if (golferIds.length === 0) return
  const rows = tournamentIds.flatMap((tid) =>
    golferIds.map((gid) => ({
      entryId,
      tournamentId: tid,
      golferId: gid,
      addedAt: opts.onlyGolferIds?.includes(gid) ? (opts.addedAt ?? null) : null,
    }))
  )
  await db.insert(golfPoolEntryRosters).values(rows).onConflictDoNothing()
}
