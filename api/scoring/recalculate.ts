import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db.js'
import { verifyAuth, isAdmin } from '../_middleware.js'
import { golfPools } from '../../src/lib/db/schema.js'
import { eq } from 'drizzle-orm'
import { recalculatePool } from '../../src/lib/scoring/recalculatePool.js'

// Admin "rescore this pool" button. Deliberately thin: it calls the same
// recalculatePool the sync uses, so multi-week scoring can never drift
// between the automatic path and the manual one. It used to carry its
// own copy of the maths and that copy was single-event.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const userId = await verifyAuth(req)
    if (!userId || !isAdmin(userId)) return res.status(403).json({ error: 'Forbidden' })

    const { poolId } = req.body
    if (!poolId) return res.status(400).json({ error: 'poolId is required' })

    const [pool] = await db
      .select()
      .from(golfPools)
      .where(eq(golfPools.id, poolId))
      .limit(1)

    if (!pool) return res.status(404).json({ error: 'Pool not found' })

    const updatedEntries = await recalculatePool(db, pool)

    return res.status(200).json({ success: true, updatedEntries })
  } catch (error) {
    console.error('POST /api/scoring/recalculate error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
