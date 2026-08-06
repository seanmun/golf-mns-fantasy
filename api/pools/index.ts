import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db.js'
import { verifyAuth } from '../_middleware.js'
import { ensureUser } from '../_ensureUser.js'
import { golfPools, golfTournaments, golfPoolEntries } from '../../src/lib/db/schema.js'
import { eq, count } from 'drizzle-orm'

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

    const result = filtered.map((p) => ({
      ...p,
      entryCount: countMap[p.id] || 0,
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
      rosterSize,
      maxEntries,
      isPublic,
      pickMode,
      draftPickSeconds,
    } = req.body

    if (!name || !tournamentId) {
      return res.status(400).json({ error: 'name and tournamentId are required' })
    }

    // A pool for an event that already teed off is dead on arrival —
    // it locks immediately and nobody can pick.
    const [tournament] = await db
      .select({ lockTime: golfTournaments.lockTime, status: golfTournaments.status })
      .from(golfTournaments)
      .where(eq(golfTournaments.id, tournamentId))
      .limit(1)
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' })
    if (
      tournament.status === 'completed' ||
      tournament.status === 'cancelled' ||
      new Date() >= tournament.lockTime
    ) {
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
        tournamentId,
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

    // The creator is a member of their own pool — otherwise they'd have
    // to join it separately and the member list looks empty.
    await db.insert(golfPoolEntries).values({
      poolId: pool.id,
      userId,
      golferIds: [],
      isLocked: false,
    })

    return res.status(201).json({ pool })
  } catch (error) {
    console.error('POST /api/pools error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
