import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, desc, asc, eq, inArray } from 'drizzle-orm'
import { db } from '../_db.js'
import { verifyAuth } from '../_middleware.js'
import { ensureUser } from '../_ensureUser.js'
import {
  golfPools,
  golfPoolEntries,
  golfGolfers,
  golfTournamentField,
  golfWaiverClaims,
  users,
} from '../../src/lib/db/schema.js'
import { rostersForPool, rosterFor } from '../../src/lib/db/entryRosters.js'
import { waiverWindowFor, freeAgentsFor, processWaivers } from '../../src/lib/waivers/engine.js'

// GET    /api/pools/waivers?poolId=  — window state, my roster, free agents
// POST   /api/pools/waivers          — submit or replace my claim
// DELETE /api/pools/waivers?poolId=  — withdraw my claim
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const poolId = (req.method === 'POST' ? req.body?.poolId : req.query.poolId) as string | undefined
  if (!poolId) return res.status(400).json({ error: 'poolId is required' })

  const [pool] = await db.select().from(golfPools).where(eq(golfPools.id, poolId)).limit(1)
  if (!pool) return res.status(404).json({ error: 'Pool not found' })

  try {
    if (req.method === 'GET') return getState(req, res, pool)
    if (req.method === 'POST') return submit(req, res, pool)
    if (req.method === 'DELETE') return withdraw(req, res, pool)
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('/api/pools/waivers error:', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    })
  }
}

type Pool = typeof golfPools.$inferSelect

async function getState(req: VercelRequest, res: VercelResponse, pool: Pool) {
  const userId = await verifyAuth(req)
  const window = await waiverWindowFor(db, pool)

  const entries = await db
    .select({
      id: golfPoolEntries.id,
      userId: golfPoolEntries.userId,
      totalPoints: golfPoolEntries.totalPoints,
      createdAt: golfPoolEntries.createdAt,
      displayName: users.displayName,
    })
    .from(golfPoolEntries)
    .innerJoin(users, eq(golfPoolEntries.userId, users.id))
    .where(eq(golfPoolEntries.poolId, pool.id))
    .orderBy(desc(golfPoolEntries.totalPoints), asc(golfPoolEntries.createdAt))

  // Waiver order is public — knowing you pick third is the whole point.
  // Who has claimed WHOM is not, until processing.
  const priority = entries.map((e, i) => ({
    position: i + 1,
    team: e.displayName,
    points: Number(e.totalPoints),
    isMe: !!userId && e.userId === userId,
  }))

  const myEntry = userId ? entries.find((e) => e.userId === userId) : undefined

  let myRoster: unknown[] = []
  let freeAgents: unknown[] = []
  let myClaim: unknown = null

  if (window.tournament) {
    if (myEntry) {
      const rosters = await rostersForPool(db, pool.id, [window.tournament.id])
      const ids = rosterFor(rosters, myEntry.id, window.tournament.id)
      const golfers = ids.length
        ? await db.select().from(golfGolfers).where(inArray(golfGolfers.id, ids))
        : []
      const byId = new Map(golfers.map((g) => [g.id, g]))
      // A golfer with no row in the upcoming event's field didn't
      // advance — that is the roster spot the owner came here to
      // replace, so it has to be visible at a glance.
      const inField = await inFieldSet(window.tournament.id, ids)
      myRoster = ids.map((id) => {
        const g = byId.get(id)
        return {
          id,
          name: g?.name ?? 'Unknown',
          worldRanking: g?.worldRanking ?? null,
          inNextField: inField.has(id),
        }
      })

      const [claim] = await db
        .select()
        .from(golfWaiverClaims)
        .where(
          and(
            eq(golfWaiverClaims.entryId, myEntry.id),
            eq(golfWaiverClaims.tournamentId, window.tournament.id)
          )
        )
        .limit(1)
      myClaim = claim ?? null
    }
    freeAgents = await freeAgentsFor(db, pool, window.tournament.id)
  }

  // Everything already settled, for the transaction log.
  const history = await db
    .select({
      id: golfWaiverClaims.id,
      status: golfWaiverClaims.status,
      tournamentId: golfWaiverClaims.tournamentId,
      grantedGolferId: golfWaiverClaims.grantedGolferId,
      dropGolferId: golfWaiverClaims.dropGolferId,
      failureReason: golfWaiverClaims.failureReason,
      processedAt: golfWaiverClaims.processedAt,
      entryId: golfWaiverClaims.entryId,
    })
    .from(golfWaiverClaims)
    .where(and(eq(golfWaiverClaims.poolId, pool.id), inArray(golfWaiverClaims.status, ['granted', 'failed'])))
    .orderBy(desc(golfWaiverClaims.processedAt))

  return res.status(200).json({
    window: {
      tournamentId: window.tournament?.id ?? null,
      tournamentName: window.tournament?.name ?? null,
      isOpen: window.isOpen,
      reason: window.reason ?? null,
      processAt: window.processAt,
    },
    priority,
    myEntry: myEntry ? { id: myEntry.id, totalPoints: Number(myEntry.totalPoints) } : null,
    myRoster,
    myClaim,
    freeAgents,
    history,
  })
}

async function inFieldSet(tournamentId: string, golferIds: string[]): Promise<Set<string>> {
  if (golferIds.length === 0) return new Set()
  const rows = await db
    .select({ golferId: golfTournamentField.golferId })
    .from(golfTournamentField)
    .where(
      and(
        eq(golfTournamentField.tournamentId, tournamentId),
        inArray(golfTournamentField.golferId, golferIds)
      )
    )
  return new Set(rows.map((r) => r.golferId))
}

async function submit(req: VercelRequest, res: VercelResponse, pool: Pool) {
  const userId = await verifyAuth(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })
  await ensureUser(userId)

  const { addGolferIds, dropGolferId } = req.body ?? {}
  if (!Array.isArray(addGolferIds) || addGolferIds.length === 0 || !dropGolferId) {
    return res.status(400).json({ error: 'addGolferIds and dropGolferId are required' })
  }

  const window = await waiverWindowFor(db, pool)
  if (!window.isOpen || !window.tournament) {
    return res.status(400).json({ error: window.reason ?? 'Waivers are not open' })
  }

  const [entry] = await db
    .select()
    .from(golfPoolEntries)
    .where(and(eq(golfPoolEntries.poolId, pool.id), eq(golfPoolEntries.userId, userId)))
    .limit(1)
  if (!entry) return res.status(403).json({ error: "You're not in this pool" })

  const rosters = await rostersForPool(db, pool.id, [window.tournament.id])
  const mine = rosterFor(rosters, entry.id, window.tournament.id)
  if (!mine.includes(dropGolferId)) {
    return res.status(400).json({ error: 'That golfer is not on your roster' })
  }

  const free = new Set((await freeAgentsFor(db, pool, window.tournament.id)).map((g) => g.id))
  const bad = (addGolferIds as string[]).filter((g) => !free.has(g))
  if (bad.length > 0) {
    return res.status(400).json({ error: 'One of those golfers is already on a team' })
  }

  // One transaction per team per window: submitting again REPLACES the
  // existing claim rather than adding a second one. The unique index on
  // (entry_id, tournament_id) is what actually guarantees it.
  const [claim] = await db
    .insert(golfWaiverClaims)
    .values({
      poolId: pool.id,
      entryId: entry.id,
      tournamentId: window.tournament.id,
      addGolferIds: addGolferIds as string[],
      dropGolferId,
      status: 'pending',
    })
    .onConflictDoUpdate({
      target: [golfWaiverClaims.entryId, golfWaiverClaims.tournamentId],
      set: {
        addGolferIds: addGolferIds as string[],
        dropGolferId,
        status: 'pending',
        grantedGolferId: null,
        failureReason: null,
        processedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning()

  return res.status(200).json({ claim })
}

async function withdraw(req: VercelRequest, res: VercelResponse, pool: Pool) {
  const userId = await verifyAuth(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const window = await waiverWindowFor(db, pool)
  if (!window.isOpen || !window.tournament) {
    return res.status(400).json({ error: window.reason ?? 'Waivers are not open' })
  }

  const [entry] = await db
    .select({ id: golfPoolEntries.id })
    .from(golfPoolEntries)
    .where(and(eq(golfPoolEntries.poolId, pool.id), eq(golfPoolEntries.userId, userId)))
    .limit(1)
  if (!entry) return res.status(403).json({ error: "You're not in this pool" })

  await db
    .delete(golfWaiverClaims)
    .where(
      and(
        eq(golfWaiverClaims.entryId, entry.id),
        eq(golfWaiverClaims.tournamentId, window.tournament.id),
        eq(golfWaiverClaims.status, 'pending')
      )
    )
  return res.status(200).json({ ok: true })
}

// Pool owner can run the window early (or re-run it) rather than waiting
// for the cron. Exported for the cron to reuse.
export async function runWaiversForPool(pool: Pool, force: boolean) {
  return processWaivers(db, pool, { force })
}
