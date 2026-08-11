import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db.js'
import { verifyAuth, isAdmin } from '../_middleware.js'
import {
  golfPools,
  golfTournaments,
  golfPoolEntries,
  golfPoolTournaments,
} from '../../src/lib/db/schema.js'
import { eq, count } from 'drizzle-orm'
import { poolTournamentRows } from '../../src/lib/db/poolTournaments.js'
import { getDraftState, controlDraft } from '../_draftService.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'DELETE') return handleDelete(req, res)
  if (req.method === 'PUT') return handleUpdate(req, res)
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { id } = req.query
    const userId = await verifyAuth(req)

    const [pool] = await db
      .select({
        id: golfPools.id,
        name: golfPools.name,
        description: golfPools.description,
        tournamentId: golfPools.tournamentId,
        rosterSize: golfPools.rosterSize,
        maxEntries: golfPools.maxEntries,
        isPublic: golfPools.isPublic,
        joinCode: golfPools.joinCode,
        status: golfPools.status,
        pickMode: golfPools.pickMode,
        draftPickSeconds: golfPools.draftPickSeconds,
        draftId: golfPools.draftId,
        scoringConfig: golfPools.scoringConfig,
        createdBy: golfPools.createdBy,
        createdAt: golfPools.createdAt,
        tournamentName: golfTournaments.name,
        tournamentCourse: golfTournaments.course,
        tournamentLocation: golfTournaments.location,
        tournamentStartDate: golfTournaments.startDate,
        tournamentEndDate: golfTournaments.endDate,
        tournamentLockTime: golfTournaments.lockTime,
        tournamentStatus: golfTournaments.status,
      })
      .from(golfPools)
      .innerJoin(golfTournaments, eq(golfPools.tournamentId, golfTournaments.id))
      .where(eq(golfPools.id, id as string))
      .limit(1)

    if (!pool) return res.status(404).json({ error: 'Pool not found' })

    const countResult = await db
      .select({ value: count() })
      .from(golfPoolEntries)
      .where(eq(golfPoolEntries.poolId, pool.id))
    const entryCount = countResult[0]?.value ?? 0

    let userEntry = null
    if (userId) {
      const entries = await db
        .select()
        .from(golfPoolEntries)
        .where(eq(golfPoolEntries.poolId, pool.id))
      userEntry = entries.find((e) => e.userId === userId) || null
    }

    // Every event this pool scores, in play order. tournamentName and
    // friends above still describe the first one, so callers that don't
    // know about multi-week pools keep rendering exactly what they did.
    const slate = await poolTournamentRows(db, pool)

    // The join code is the key to a private pool — only the owner and
    // people already in it get to see one.
    const canSeeJoinCode = !!userId && (userId === pool.createdBy || !!userEntry)
    return res.status(200).json({
      pool: { ...pool, joinCode: canSeeJoinCode ? pool.joinCode : null },
      tournaments: slate.map((t) => ({
        id: t.id,
        name: t.name,
        course: t.course,
        location: t.location,
        startDate: t.startDate,
        endDate: t.endDate,
        lockTime: t.lockTime,
        status: t.status,
      })),
      entryCount: entryCount || 0,
      userEntry,
    })
  } catch (error) {
    console.error('GET /api/pools/[id] error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  try {
    const userId = await verifyAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })

    const { id } = req.query

    const [pool] = await db
      .select()
      .from(golfPools)
      .where(eq(golfPools.id, id as string))
      .limit(1)

    if (!pool) return res.status(404).json({ error: 'Pool not found' })
    if (pool.createdBy !== userId && !isAdmin(userId)) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    // Cancel the draft in the hub first so it isn't orphaned pointing at
    // a pool that no longer exists.
    if (pool.draftId) {
      await controlDraft(pool.draftId, { action: 'cancel' }).catch(() => {
        /* a stuck draft service shouldn't block deleting the pool */
      })
    }

    // Children first, then the pool — both reference it.
    await db.delete(golfPoolEntries).where(eq(golfPoolEntries.poolId, pool.id))
    await db.delete(golfPoolTournaments).where(eq(golfPoolTournaments.poolId, pool.id))
    await db.delete(golfPools).where(eq(golfPools.id, pool.id))

    return res.status(200).json({ success: true })
  } catch (error) {
    console.error('DELETE /api/pools/[id] error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

async function handleUpdate(req: VercelRequest, res: VercelResponse) {
  try {
    const userId = await verifyAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })

    const { id } = req.query
    const { name, description, rosterSize, maxEntries, isPublic } = req.body

    const [pool] = await db
      .select()
      .from(golfPools)
      .where(eq(golfPools.id, id as string))
      .limit(1)

    if (!pool) return res.status(404).json({ error: 'Pool not found' })
    if (pool.createdBy !== userId && !isAdmin(userId)) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    // Roster size sets the number of draft rounds. Once a draft is
    // running the board is fixed, so this can only change beforehand —
    // start re-sends it to the draft service.
    if (rosterSize !== undefined && rosterSize !== pool.rosterSize && pool.draftId) {
      try {
        const state = (await getDraftState(pool.draftId)) as { draft: { status: string } }
        if (state.draft.status !== 'setup') {
          return res
            .status(400)
            .json({ error: 'Picks per team cannot change once the draft has started' })
        }
      } catch {
        // Draft service unreachable — allow the edit rather than block.
      }
    }

    if (maxEntries !== undefined && maxEntries !== null) {
      const [{ value: current }] = await db
        .select({ value: count() })
        .from(golfPoolEntries)
        .where(eq(golfPoolEntries.poolId, pool.id))
      if (maxEntries < current) {
        return res
          .status(400)
          .json({ error: `${current} teams have already joined — max entries can't be lower` })
      }
    }

    const updates: Record<string, any> = { updatedAt: new Date() }
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (rosterSize !== undefined) updates.rosterSize = rosterSize
    if (maxEntries !== undefined) updates.maxEntries = maxEntries
    if (isPublic !== undefined) updates.isPublic = isPublic

    await db.update(golfPools).set(updates).where(eq(golfPools.id, pool.id))

    // Push settings straight to a draft that hasn't started, so the
    // draft room never shows stale values between edit and start.
    if (pool.draftId && (rosterSize !== undefined || name !== undefined)) {
      await controlDraft(pool.draftId, {
        action: 'set_config',
        ...(rosterSize !== undefined ? { rounds: rosterSize } : {}),
      }).catch(() => {
        /* draft already started, or service down — start re-sends it */
      })
    }

    return res.status(200).json({ success: true })
  } catch (error) {
    console.error('PUT /api/pools/[id] error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
