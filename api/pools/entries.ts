import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db.js'
import { verifyAuth } from '../_middleware.js'
import { golfPools, golfPoolEntries, golfTournaments } from '../../src/lib/db/schema.js'
import { eq, and } from 'drizzle-orm'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const userId = await verifyAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })

    const { poolId, golferIds } = req.body

    if (!poolId || !Array.isArray(golferIds)) {
      return res.status(400).json({ error: 'poolId and golferIds array are required' })
    }

    // Fetch pool + tournament
    const [pool] = await db
      .select({
        id: golfPools.id,
        rosterSize: golfPools.rosterSize,
        status: golfPools.status,
        lockTime: golfTournaments.lockTime,
      })
      .from(golfPools)
      .innerJoin(golfTournaments, eq(golfPools.tournamentId, golfTournaments.id))
      .where(eq(golfPools.id, poolId))
      .limit(1)

    if (!pool) return res.status(404).json({ error: 'Pool not found' })

    // Enforce lock
    if (pool.status === 'locked' || pool.status === 'active' || new Date() >= new Date(pool.lockTime)) {
      return res.status(403).json({ error: 'Picks are locked' })
    }

    if (golferIds.length !== pool.rosterSize) {
      return res.status(400).json({ error: `You must pick exactly ${pool.rosterSize} golfers` })
    }

    // Upsert entry
    const [existing] = await db
      .select()
      .from(golfPoolEntries)
      .where(and(eq(golfPoolEntries.poolId, poolId), eq(golfPoolEntries.userId, userId)))
      .limit(1)

    if (existing) {
      if (existing.isLocked) return res.status(403).json({ error: 'Entry is locked' })

      const [updated] = await db
        .update(golfPoolEntries)
        .set({ golferIds, submittedAt: new Date(), updatedAt: new Date() })
        .where(eq(golfPoolEntries.id, existing.id))
        .returning()

      return res.status(200).json({ entry: updated })
    }

    const [entry] = await db
      .insert(golfPoolEntries)
      .values({ poolId, userId, golferIds, submittedAt: new Date() })
      .returning()

    return res.status(201).json({ entry })
  } catch (error) {
    console.error('POST /api/pools/entries error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
