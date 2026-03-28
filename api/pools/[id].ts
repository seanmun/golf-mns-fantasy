import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db.js'
import { verifyAuth, isAdmin } from '../_middleware.js'
import { golfPools, golfTournaments, golfPoolEntries } from '../../src/lib/db/schema.js'
import { eq, count } from 'drizzle-orm'

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

    return res.status(200).json({ pool, entryCount: entryCount || 0, userEntry })
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

    // Delete entries first, then the pool
    await db.delete(golfPoolEntries).where(eq(golfPoolEntries.poolId, pool.id))
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

    const updates: Record<string, any> = { updatedAt: new Date() }
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (rosterSize !== undefined) updates.rosterSize = rosterSize
    if (maxEntries !== undefined) updates.maxEntries = maxEntries
    if (isPublic !== undefined) updates.isPublic = isPublic

    await db.update(golfPools).set(updates).where(eq(golfPools.id, pool.id))

    return res.status(200).json({ success: true })
  } catch (error) {
    console.error('PUT /api/pools/[id] error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
