import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db.js'
import { verifyAuth, isAdmin } from '../_middleware.js'
import { golfTournaments } from '../../src/lib/db/schema.js'
import { eq } from 'drizzle-orm'

interface SdTournament {
  TournamentID: number
  Name: string
  StartDate: string
  EndDate: string
  Venue: string | null
  Location: string | null
  IsOver: boolean
  Canceled: boolean
}

// POST { season?: number, externalId?: number }
// - with externalId: import/refresh that single event
// - without: import every not-yet-finished event of the season
// Idempotent — upserts by externalId, never touches status/lastSyncedAt
// of existing rows (sync owns those).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const userId = await verifyAuth(req)
    if (!userId || !isAdmin(userId)) return res.status(403).json({ error: 'Forbidden' })

    const apiKey = process.env.GOLF_API_KEY
    const baseUrl = process.env.GOLF_API_BASE_URL || 'https://api.sportsdata.io/golf/v2/json'
    if (!apiKey) return res.status(500).json({ error: 'GOLF_API_KEY not configured' })

    const season: number = req.body?.season || new Date().getFullYear()
    const onlyExternalId: number | undefined = req.body?.externalId

    const schedRes = await fetch(`${baseUrl}/Tournaments/${season}?key=${apiKey}`)
    if (!schedRes.ok) {
      return res.status(502).json({ error: `SportsData Tournaments returned ${schedRes.status}` })
    }
    const schedule: SdTournament[] = await schedRes.json()

    const wanted = schedule.filter((t) => {
      if (t.Canceled) return false
      if (onlyExternalId) return t.TournamentID === onlyExternalId
      return !t.IsOver
    })
    if (onlyExternalId && wanted.length === 0) {
      return res.status(404).json({ error: `TournamentID ${onlyExternalId} not found in ${season}` })
    }

    let created = 0
    let updated = 0

    for (const t of wanted) {
      const externalId = String(t.TournamentID)
      const values = {
        name: t.Name,
        course: t.Venue || t.Name,
        location: t.Location || null,
        startDate: new Date(t.StartDate),
        endDate: new Date(t.EndDate),
        // Rosters lock the morning of round 1. sportsdata StartDate is
        // midnight (UTC on Vercel) of round-1 day; +11h ≈ 6:00 AM CT,
        // before the earliest tee time. Admin can adjust per event.
        lockTime: new Date(new Date(t.StartDate).getTime() + 11 * 60 * 60 * 1000),
        season,
      }

      const [existing] = await db
        .select({ id: golfTournaments.id })
        .from(golfTournaments)
        .where(eq(golfTournaments.externalId, externalId))
        .limit(1)

      if (existing) {
        await db.update(golfTournaments).set(values).where(eq(golfTournaments.id, existing.id))
        updated++
      } else {
        await db.insert(golfTournaments).values({ ...values, externalId })
        created++
      }
    }

    return res.status(200).json({ success: true, season, created, updated })
  } catch (error) {
    console.error('POST /api/admin/tournaments error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
