import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db.js'
import { verifyAuth, isAdmin } from '../_middleware.js'
import { golfTournaments } from '../../src/lib/db/schema.js'
import { eq } from 'drizzle-orm'
import {
  sgFetch,
  ts,
  type SgScheduleEvent,
  type SgTournamentInfo,
} from '../_slashgolf.js'

// POST { season?: number, tournId?: string }
// - with tournId: import/refresh that single event (fetches venue too)
// - without: import every not-yet-finished event of the season from the
//   SlashGolf schedule. Venue (courses) is only fetched for events we
//   don't have yet, to conserve the call budget.
// Idempotent — upserts by externalId; status/lastSyncedAt belong to sync.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const userId = await verifyAuth(req)
    if (!userId || !isAdmin(userId)) return res.status(403).json({ error: 'Forbidden' })

    const season: number = req.body?.season || new Date().getFullYear()
    const onlyTournId: string | undefined = req.body?.tournId

    const sched = await sgFetch<{ schedule: SgScheduleEvent[] }>(
      `schedule?year=${season}&orgId=1`
    )

    const now = new Date()
    const wanted = sched.schedule.filter((t) => {
      if (onlyTournId) return t.tournId === onlyTournId
      const end = ts(t.date.end)
      return end != null && end.getTime() > now.getTime()
    })
    if (onlyTournId && wanted.length === 0) {
      return res.status(404).json({ error: `tournId ${onlyTournId} not in ${season} schedule` })
    }

    let created = 0
    let updated = 0
    let venueCalls = 0

    for (const t of wanted) {
      const start = ts(t.date.start)
      const end = ts(t.date.end)
      if (!start || !end) continue

      const [existing] = await db
        .select({ id: golfTournaments.id, course: golfTournaments.course })
        .from(golfTournaments)
        .where(eq(golfTournaments.externalId, t.tournId))
        .limit(1)

      const base = {
        name: t.name,
        startDate: start,
        endDate: end,
        // Rosters lock the morning of round 1 (~6:00 AM CT).
        lockTime: new Date(start.getTime() + 11 * 60 * 60 * 1000),
        season,
      }

      if (existing) {
        await db.update(golfTournaments).set(base).where(eq(golfTournaments.id, existing.id))
        updated++
      } else {
        // New event: one tournament-info call for the venue.
        let course = t.name
        try {
          const info = await sgFetch<SgTournamentInfo>(
            `tournament?orgId=1&tournId=${t.tournId}&year=${season}`
          )
          venueCalls++
          const host = info.courses?.find((c) => c.host === 'Yes') ?? info.courses?.[0]
          if (host?.courseName) course = host.courseName
        } catch (err) {
          console.error(`tournament info failed for ${t.tournId}:`, err)
        }
        await db.insert(golfTournaments).values({
          ...base,
          course,
          externalId: t.tournId,
        })
        created++
      }
    }

    return res.status(200).json({ success: true, source: 'slashgolf', season, created, updated, venueCalls })
  } catch (error) {
    console.error('POST /api/admin/tournaments error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
