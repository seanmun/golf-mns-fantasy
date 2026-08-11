import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db.js'
import { verifyAuth } from '../_middleware.js'
import { ensureUser } from '../_ensureUser.js'
import {
  golfPools,
  golfTournaments,
  golfPoolEntries,
  golfPoolTournaments,
} from '../../src/lib/db/schema.js'
import { eq, count, inArray } from 'drizzle-orm'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return getPools(req, res)
  if (req.method === 'POST') return createPool(req, res)
  return res.status(405).json({ error: 'Method not allowed' })
}

async function getPools(req: VercelRequest, res: VercelResponse) {
  try {
    const { tournamentId, status } = req.query

    const pools = await db
      .select({
        id: golfPools.id,
        name: golfPools.name,
        description: golfPools.description,
        tournamentId: golfPools.tournamentId,
        rosterSize: golfPools.rosterSize,
        pickMode: golfPools.pickMode,
        draftId: golfPools.draftId,
        maxEntries: golfPools.maxEntries,
        status: golfPools.status,
        createdBy: golfPools.createdBy,
        createdAt: golfPools.createdAt,
        tournamentName: golfTournaments.name,
        tournamentCourse: golfTournaments.course,
        tournamentStartDate: golfTournaments.startDate,
        tournamentLockTime: golfTournaments.lockTime,
        tournamentStatus: golfTournaments.status,
      })
      .from(golfPools)
      .innerJoin(golfTournaments, eq(golfPools.tournamentId, golfTournaments.id))
      .where(eq(golfPools.isPublic, true))

    const filtered = pools.filter((p) => {
      if (tournamentId && p.tournamentId !== tournamentId) return false
      if (status && p.status !== status) return false
      return true
    })

    // Get entry counts
    const entryCounts = await db
      .select({ poolId: golfPoolEntries.poolId, count: count() })
      .from(golfPoolEntries)
      .groupBy(golfPoolEntries.poolId)

    const countMap = Object.fromEntries(entryCounts.map((e) => [e.poolId, e.count]))

    // How many events each pool spans, so the card can say "+2 more"
    // instead of naming only the first one.
    const eventCounts = await db
      .select({ poolId: golfPoolTournaments.poolId, count: count() })
      .from(golfPoolTournaments)
      .groupBy(golfPoolTournaments.poolId)
    const eventMap = Object.fromEntries(eventCounts.map((e) => [e.poolId, e.count]))

    const result = filtered.map((p) => ({
      ...p,
      entryCount: countMap[p.id] || 0,
      // Pools created before pool_tournaments existed have no rows.
      eventCount: eventMap[p.id] || 1,
    }))

    return res.status(200).json({ pools: result })
  } catch (error) {
    console.error('GET /api/pools error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

async function createPool(req: VercelRequest, res: VercelResponse) {
  try {
    const userId = await verifyAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })
    await ensureUser(userId)

    const {
      name,
      description,
      tournamentId,
      tournamentIds,
      rosterSize,
      maxEntries,
      isPublic,
      pickMode,
      draftPickSeconds,
    } = req.body

    // One event or several. tournamentId stays accepted so anything
    // still posting the old shape keeps working.
    const requestedIds: string[] = [
      ...new Set(
        (Array.isArray(tournamentIds) && tournamentIds.length > 0
          ? tournamentIds
          : [tournamentId]
        ).filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      ),
    ]

    if (!name || requestedIds.length === 0) {
      return res.status(400).json({ error: 'name and at least one tournament are required' })
    }
    if (requestedIds.length > 8) {
      return res.status(400).json({ error: 'A pool can span at most 8 events' })
    }

    const found = await db
      .select({
        id: golfTournaments.id,
        startDate: golfTournaments.startDate,
        lockTime: golfTournaments.lockTime,
        status: golfTournaments.status,
      })
      .from(golfTournaments)
      .where(inArray(golfTournaments.id, requestedIds))
    if (found.length !== requestedIds.length) {
      return res.status(404).json({ error: 'Tournament not found' })
    }

    // Play order decides everything downstream: the first event's lock
    // time locks the pool, and its field is what gets drafted.
    const slate = [...found].sort((a, b) => a.startDate.getTime() - b.startDate.getTime())

    const dead = slate.find((t) => t.status === 'completed' || t.status === 'cancelled')
    if (dead) {
      return res.status(400).json({ error: 'One of those events is already over — pick upcoming ones' })
    }
    // A pool whose first event has teed off is dead on arrival: it locks
    // immediately and nobody can draft.
    if (new Date() >= slate[0].lockTime) {
      return res
        .status(400)
        .json({ error: 'That event has already started — pick an upcoming one' })
    }

    // Join codes are random; retry a few times rather than 500 on the
    // rare unique-constraint collision.
    const makeCode = () => Math.random().toString(36).substring(2, 8).toUpperCase()
    let joinCode = makeCode()
    for (let attempt = 0; attempt < 5; attempt++) {
      const [clash] = await db
        .select({ id: golfPools.id })
        .from(golfPools)
        .where(eq(golfPools.joinCode, joinCode))
        .limit(1)
      if (!clash) break
      joinCode = makeCode()
    }

    const [pool] = await db
      .insert(golfPools)
      .values({
        name,
        description: description || null,
        // Always the earliest event — see the column comment in schema.ts.
        tournamentId: slate[0].id,
        createdBy: userId,
        rosterSize: rosterSize || 6,
        maxEntries: maxEntries || null,
        isPublic: isPublic !== false,
        joinCode,
        status: 'open',
        pickMode: pickMode === 'draft' ? 'draft' : 'pickem',
        // Only meaningful for draft pools; null means a slow draft.
        draftPickSeconds:
          pickMode === 'draft' && draftPickSeconds ? Number(draftPickSeconds) : null,
      })
      .returning()

    // Write a row per event even for a one-week pool, so every reader
    // has one shape to handle and nothing depends on the fallback.
    await db.insert(golfPoolTournaments).values(
      slate.map((t, i) => ({
        poolId: pool.id,
        tournamentId: t.id,
        sortOrder: i,
      }))
    )

    // The creator is a member of their own pool — otherwise they'd have
    // to join it separately and the member list looks empty.
    await db.insert(golfPoolEntries).values({
      poolId: pool.id,
      userId,
      golferIds: [],
      isLocked: false,
    })

    return res.status(201).json({ pool, eventCount: slate.length })
  } catch (error) {
    console.error('POST /api/pools error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
