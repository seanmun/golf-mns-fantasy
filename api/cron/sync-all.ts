import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db.js'
import { golfTournaments } from '../../src/lib/db/schema.js'
import { inArray } from 'drizzle-orm'
import { eq } from 'drizzle-orm'
import { syncTournament } from '../../src/lib/scoring/syncTournament.js'
import { sgFetch, type SgTournamentInfo } from '../_slashgolf.js'

// Automated sync floor. vercel.json fires this at several fixed UTC
// times daily (Hobby-compatible: each cron entry runs once per day).
// This endpoint converts "now" into each tournament's LOCAL time and
// syncs only when the tick lands in one of three local windows:
//   midday [10:00–14:00)  · late [14:00–19:00) · post-play [19:00–24:00)
// Max one sync per window per local day => max 3/day per tournament.
// The scorecard stat-pass runs only in the post-play window (or when
// the event is final), i.e. after play ends AT THE COURSE — day
// boundaries are never computed in UTC.

type Window = 'midday' | 'late' | 'post'

function localParts(d: Date, timeZone: string): { hour: number; day: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return {
    hour: Number(get('hour')) % 24,
    day: `${get('year')}-${get('month')}-${get('day')}`,
  }
}

function windowOf(hour: number): Window | null {
  if (hour >= 10 && hour < 14) return 'midday'
  if (hour >= 14 && hour < 19) return 'late'
  if (hour >= 19) return 'post'
  return null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel cron invocations send: Authorization: Bearer <CRON_SECRET>
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const now = new Date()
    const candidates = await db
      .select()
      .from(golfTournaments)
      .where(inArray(golfTournaments.status, ['upcoming', 'active']))

    const report: Array<Record<string, unknown>> = []

    for (const t of candidates) {
      // Only touch events whose window [start, end + 1 day] contains now.
      const windowStart = t.startDate.getTime()
      const windowEnd = t.endDate.getTime() + 24 * 60 * 60 * 1000
      if (now.getTime() < windowStart || now.getTime() > windowEnd) continue
      if (!t.externalId) continue

      // Ensure we know the venue timezone (one-time fetch, then stored).
      let timeZone = t.timeZone
      if (!timeZone) {
        try {
          const info = await sgFetch<SgTournamentInfo>(
            `tournament?orgId=1&tournId=${t.externalId}&year=${t.season}`
          )
          timeZone = info.timeZone || 'America/New_York'
          await db
            .update(golfTournaments)
            .set({ timeZone })
            .where(eq(golfTournaments.id, t.id))
        } catch (err) {
          console.error(`timezone fetch failed for ${t.name}:`, err)
          report.push({ tournament: t.name, skipped: 'no timezone' })
          continue
        }
      }

      const local = localParts(now, timeZone)
      const win = windowOf(local.hour)
      if (!win) {
        report.push({ tournament: t.name, skipped: `outside windows (local ${local.hour}:00)` })
        continue
      }

      // One sync per window per LOCAL day: if the last sync fell in the
      // same local day + window, skip.
      if (t.lastSyncedAt) {
        const lastLocal = localParts(t.lastSyncedAt, timeZone)
        if (lastLocal.day === local.day && windowOf(lastLocal.hour) === win) {
          report.push({ tournament: t.name, skipped: `already synced ${win} window` })
          continue
        }
      }

      const withScorecards = win === 'post'
      const result = await syncTournament(db, t, { withScorecards })
      report.push({ tournament: t.name, window: win, withScorecards, ...result })
    }

    return res.status(200).json({ ranAt: now.toISOString(), tournaments: report })
  } catch (error) {
    console.error('GET /api/cron/sync-all error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
