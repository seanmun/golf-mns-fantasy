import { and, eq, inArray } from 'drizzle-orm'
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import { golfPools, golfPoolEntries, golfTournamentField } from '../db/schema.js'
import { rostersForPool, rosterFor } from '../db/entryRosters.js'
import { waiverWindowFor } from './engine.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = NeonHttpDatabase<any>

export interface WaiverSummary {
  isOpen: boolean
  reason: string | null
  tournamentName: string | null
  processAt: Date | null
  deadOnMyRoster: number
  myRosterSize: number
}

// The compact form every page needs to decide whether to shout about a
// window. Lives here because the pool page is NOT where people land —
// the dashboard sends them to the leaderboard once play starts, so the
// prompt has to exist on more than one page or nobody sees it.
export async function waiverSummary(
  db: Db,
  pool: typeof golfPools.$inferSelect,
  userId: string | null
): Promise<WaiverSummary | null> {
  const win = await waiverWindowFor(db, pool)
  if (!win.tournament) return null

  let deadOnMyRoster = 0
  let myRosterSize = 0

  if (win.isOpen && userId) {
    const [entry] = await db
      .select({ id: golfPoolEntries.id })
      .from(golfPoolEntries)
      .where(and(eq(golfPoolEntries.poolId, pool.id), eq(golfPoolEntries.userId, userId)))
      .limit(1)
    if (entry) {
      const rosters = await rostersForPool(db, pool.id, [win.tournament.id])
      const mine = rosterFor(rosters, entry.id, win.tournament.id)
      myRosterSize = mine.length
      if (mine.length > 0) {
        const alive = await db
          .select({ golferId: golfTournamentField.golferId })
          .from(golfTournamentField)
          .where(
            and(
              eq(golfTournamentField.tournamentId, win.tournament.id),
              inArray(golfTournamentField.golferId, mine)
            )
          )
        const set = new Set(alive.map((a) => a.golferId))
        deadOnMyRoster = mine.filter((g) => !set.has(g)).length
      }
    }
  }

  return {
    isOpen: win.isOpen,
    reason: win.reason ?? null,
    tournamentName: win.tournament.name,
    processAt: win.processAt,
    deadOnMyRoster,
    myRosterSize,
  }
}
