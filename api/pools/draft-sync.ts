import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, isNotNull, and } from 'drizzle-orm'
import { db } from '../_db.js'
import { verifyAuth } from '../_middleware.js'
import { golfPools } from '../../src/lib/db/schema.js'
import { syncDraftToEntries } from './draft.js'

// POST /api/pools/draft-sync { poolId? }
// Copies completed draft picks into pool entries. Any signed-in user
// can trigger it (the draft room calls it when the board finishes) so
// rosters are never left unsaved because the owner forgot to click.
// Idempotent: it just rewrites entries from the authoritative board.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const userId = await verifyAuth(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const poolId = req.body?.poolId as string | undefined
    const pools = poolId
      ? await db.select().from(golfPools).where(eq(golfPools.id, poolId)).limit(1)
      : await db
          .select()
          .from(golfPools)
          .where(and(eq(golfPools.pickMode, 'draft'), isNotNull(golfPools.draftId)))

    const report: Array<Record<string, unknown>> = []
    for (const pool of pools) {
      if (!pool.draftId) continue
      try {
        const result = await syncDraftToEntries(pool.id, pool.draftId)
        report.push({ pool: pool.name, ...result })
      } catch (err) {
        report.push({ pool: pool.name, failed: err instanceof Error ? err.message : String(err) })
      }
    }
    return res.status(200).json({ ok: true, pools: report })
  } catch (error) {
    console.error('POST /api/pools/draft-sync error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
