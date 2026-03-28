import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db.js'
import { verifyAuth } from '../_middleware.js'
import { golfPools, golfPoolEntries } from '../../src/lib/db/schema.js'
import { eq, and, count } from 'drizzle-orm'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const userId = await verifyAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })

    const { joinCode } = req.body
    if (!joinCode) return res.status(400).json({ error: 'joinCode is required' })

    const [pool] = await db
      .select()
      .from(golfPools)
      .where(eq(golfPools.joinCode, joinCode.toUpperCase()))
      .limit(1)

    if (!pool) return res.status(404).json({ error: 'Pool not found' })
    if (pool.status === 'cancelled') return res.status(400).json({ error: 'Pool is cancelled' })
    if (pool.status === 'completed') return res.status(400).json({ error: 'Pool is already completed' })

    // Check already in pool
    const [existing] = await db
      .select()
      .from(golfPoolEntries)
      .where(and(eq(golfPoolEntries.poolId, pool.id), eq(golfPoolEntries.userId, userId)))
      .limit(1)

    if (existing) return res.status(200).json({ pool, alreadyJoined: true })

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
