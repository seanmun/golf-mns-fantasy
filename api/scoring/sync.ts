import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db.js'
import { verifyAuth, isAdmin } from '../_middleware.js'
import { golfTournaments } from '../../src/lib/db/schema.js'
import { eq } from 'drizzle-orm'
import { syncTournament } from '../../src/lib/scoring/syncTournament.js'

// Viewer/admin-triggered sync. The cron (/api/cron/sync-all) is the
// guaranteed floor; this endpoint is a bonus refresh path with hard
// throttles so viewer traffic can't burn the API budget.
const LEADERBOARD_THROTTLE_MS = 8 * 60 * 60 * 1000 // max 3 pulls/day (Sean, 2026-07-23)
const SCORECARD_THROTTLE_MS = 20 * 60 * 60 * 1000 // ~daily

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const tournamentId =
      (req.method === 'POST' ? req.body?.tournamentId : req.query.tournamentId) as
        | string
        | undefined
    if (!tournamentId) return res.status(400).json({ error: 'tournamentId is required' })

    const [tournament] = await db
      .select()
      .from(golfTournaments)
      .where(eq(golfTournaments.id, tournamentId))
      .limit(1)
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' })
    if (tournament.status === 'completed' || tournament.status === 'cancelled') {
      return res.status(200).json({ synced: false, reason: `Tournament ${tournament.status}` })
    }

    const force = req.query.force === '1' || req.body?.force === true
    let isAdminCaller = false
    if (force) {
      const userId = await verifyAuth(req)
      isAdminCaller = !!userId && isAdmin(userId)
    }
    const now = new Date()
    const last = tournament.lastSyncedAt?.getTime() ?? 0
    if (!(force && isAdminCaller) && now.getTime() - last < LEADERBOARD_THROTTLE_MS) {
      return res.status(200).json({ synced: false, reason: 'Throttled' })
    }
    if (!(force && isAdminCaller) && tournament.status === 'upcoming' && now < tournament.startDate) {
      return res.status(200).json({ synced: false, reason: 'Not started yet' })
    }

    const withScorecards =
      now.getTime() - (tournament.lastFullSyncAt?.getTime() ?? 0) >= SCORECARD_THROTTLE_MS

    const result = await syncTournament(db, tournament, { withScorecards })
    return res.status(200).json({ source: 'slashgolf', ...result })
  } catch (error) {
    console.error('POST /api/scoring/sync error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
