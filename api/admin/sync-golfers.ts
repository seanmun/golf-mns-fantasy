import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db.js'
import { verifyAuth, isAdmin } from '../_middleware.js'
import { syncGolfers } from '../../src/lib/scoring/syncGolfers.js'
import { recomputeSeasonStats } from '../../src/lib/scoring/seasonStats.js'

// Manual trigger for the OWGR pull. The cron runs the same function
// daily (api/cron/sync-all.ts) — this is the "do it now" button.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const userId = await verifyAuth(req)
    if (!userId || !isAdmin(userId)) return res.status(403).json({ error: 'Forbidden' })

    const season: number = req.body?.season || new Date().getFullYear()
    const result = await syncGolfers(db, season)
    const statsUpdated = await recomputeSeasonStats(db, season)

    return res.status(200).json({
      success: true,
      source: 'slashgolf-owgr',
      season,
      ...result,
      statsUpdated,
    })
  } catch (error) {
    console.error('POST /api/admin/sync-golfers error:', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    })
  }
}
