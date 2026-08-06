import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db.js'
import { verifyAuth } from '../_middleware.js'
import { golfPools, golfPoolEntries, golfTournaments } from '../../src/lib/db/schema.js'
import { eq, and, count } from 'drizzle-orm'
import { getDraftState } from '../_draftService.js'
import { ensureUser } from '../_ensureUser.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // GET ?joinCode= — what the join page shows before anyone commits.
  if (req.method === 'GET') {
    const joinCode = (req.query.joinCode as string | undefined)?.toUpperCase()
    if (!joinCode) return res.status(400).json({ error: 'joinCode is required' })
    const [pool] = await db
      .select({
        id: golfPools.id,
        name: golfPools.name,
        description: golfPools.description,
        rosterSize: golfPools.rosterSize,
        pickMode: golfPools.pickMode,
        status: golfPools.status,
        tournamentName: golfTournaments.name,
        tournamentCourse: golfTournaments.course,
        tournamentStartDate: golfTournaments.startDate,
        lockTime: golfTournaments.lockTime,
        tournamentStatus: golfTournaments.status,
      })
      .from(golfPools)
      .innerJoin(golfTournaments, eq(golfPools.tournamentId, golfTournaments.id))
      .where(eq(golfPools.joinCode, joinCode))
      .limit(1)
    if (!pool) return res.status(404).json({ error: 'That join code does not match a pool' })
    const [{ value: entryCount }] = await db
      .select({ value: count() })
      .from(golfPoolEntries)
      .where(eq(golfPoolEntries.poolId, pool.id))

    const userId = await verifyAuth(req)
    let alreadyJoined = false
    if (userId) {
      const [mine] = await db
        .select({ id: golfPoolEntries.id })
        .from(golfPoolEntries)
        .where(and(eq(golfPoolEntries.poolId, pool.id), eq(golfPoolEntries.userId, userId)))
        .limit(1)
      alreadyJoined = !!mine
    }
    return res.status(200).json({ pool, entryCount, alreadyJoined })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const userId = await verifyAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })

    // Two ways in: a join code (private pools, share links) or a pool id
    // (the public browse list, where the code is nobody's business).
    const { joinCode, poolId } = req.body ?? {}
    if (!joinCode && !poolId) {
      return res.status(400).json({ error: 'joinCode or poolId is required' })
    }
    if (poolId && !UUID_RE.test(String(poolId))) {
      return res.status(400).json({ error: 'Invalid pool id' })
    }

    const [pool] = poolId
      ? await db.select().from(golfPools).where(eq(golfPools.id, String(poolId))).limit(1)
      : await db
          .select()
          .from(golfPools)
          .where(eq(golfPools.joinCode, String(joinCode).toUpperCase()))
          .limit(1)

    if (!pool) return res.status(404).json({ error: 'Pool not found' })
    // A private pool is only joinable by someone holding its code.
    if (poolId && !pool.isPublic) {
      return res.status(403).json({ error: 'This pool is private — you need its join code' })
    }
    if (pool.status === 'cancelled') return res.status(400).json({ error: 'Pool is cancelled' })
    if (pool.status === 'completed') return res.status(400).json({ error: 'Pool is already completed' })

    // Check already in pool
    // A brand-new account may not have a row yet — create it before
    // writing anything that references it.
    await ensureUser(userId)

    const [existing] = await db
      .select()
      .from(golfPoolEntries)
      .where(and(eq(golfPoolEntries.poolId, pool.id), eq(golfPoolEntries.userId, userId)))
      .limit(1)

    if (existing) return res.status(200).json({ pool, alreadyJoined: true })

    // The event itself may have started even if a sync hasn't yet
    // flipped the pool to locked.
    const [tournament] = await db
      .select({ lockTime: golfTournaments.lockTime, status: golfTournaments.status })
      .from(golfTournaments)
      .where(eq(golfTournaments.id, pool.tournamentId))
      .limit(1)
    if (
      tournament &&
      (tournament.status === 'completed' || new Date() >= tournament.lockTime)
    ) {
      return res.status(400).json({ error: 'This event has already started' })
    }

    // A started draft has fixed pick slots — joining now would leave
    // someone in the pool with no way to draft a team.
    if (pool.pickMode === 'draft' && pool.draftId) {
      try {
        const state = (await getDraftState(pool.draftId)) as { draft: { status: string } }
        if (state.draft.status !== 'setup') {
          return res.status(400).json({ error: 'The draft has already started' })
        }
      } catch {
        // If the draft service is unreachable, don't block the join.
      }
    }

    // Check max entries
    if (pool.maxEntries) {
      const [{ value: entryCount }] = await db
        .select({ value: count() })
        .from(golfPoolEntries)
        .where(eq(golfPoolEntries.poolId, pool.id))

      if (entryCount >= pool.maxEntries) {
        return res.status(400).json({ error: 'Pool is full' })
      }
    }

    // Create empty entry — picks submitted separately
    const [entry] = await db
      .insert(golfPoolEntries)
      .values({
        poolId: pool.id,
        userId,
        golferIds: [],
        isLocked: false,
      })
      .returning()

    return res.status(201).json({ pool, entry })
  } catch (error) {
    console.error('POST /api/pools/join error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
