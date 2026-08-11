import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db.js'
import { golfTournaments, golfGolfers } from '../../src/lib/db/schema.js'
import { inArray, sql } from 'drizzle-orm'
import { eq } from 'drizzle-orm'
import { syncTournament } from '../../src/lib/scoring/syncTournament.js'
import { syncGolfers } from '../../src/lib/scoring/syncGolfers.js'
import { sgFetch, type SgTournamentInfo } from '../_slashgolf.js'

// Automated sync. vercel.json fires this once per UTC hour (24 separate
// once-daily entries, which is the form Vercel Hobby accepts). This
// endpoint converts "now" into each tournament's LOCAL time and syncs
// hourly while play is plausible at the venue — day boundaries are
// never computed in UTC. Every sync includes the scorecard pass, so
// fantasy points move hourly, not just positions.
//
// Budget (verified 2026-08-01): scorecards and requests are SEPARATE
// RapidAPI buckets — scorecard calls don't touch the 2,000/month request
// quota, which has its own 2,000/day. Hourly costs ~1 request/hour plus
// one scorecard per picked golfer.

const PLAY_START_HOUR = 6 // venue-local
const PLAY_END_HOUR = 23 // inclusive
// Guard against double-firing within an hour (Vercel Hobby cron
// precision is ±59 min, so ticks can land close together).
const MIN_GAP_MS = 45 * 60 * 1000

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel cron invocations send: Authorization: Bearer <CRON_SECRET>
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const now = new Date()
    // Ops levers (same CRON_SECRET auth): limit to one tournament and/or
    // bypass the date/local-window gates to settle an event on demand.
    const onlyTournamentId = req.query.tournamentId as string | undefined
    const force = req.query.force === '1'

    // Golfers first, and automatically.
    //
    // The tournament sync matches leaderboard rows to golfers by
    // playerId and SKIPS anyone it doesn't know — silently, straight out
    // of tournament_field and so out of every draft. That made the
    // golfer table a hidden dependency of the whole pipeline while being
    // the one piece that only ever ran when a human pressed a button.
    // Six of the FedEx playoff field went missing exactly that way.
    //
    // One API call, one bulk upsert, at most once a day. Rankings move
    // weekly, so daily is ample.
    const GOLFER_MAX_AGE_MS = 20 * 60 * 60 * 1000
    let golferSync: Record<string, unknown> = { ran: false }
    const [freshest] = await db
      .select({ newest: sql<Date | null>`max(${golfGolfers.updatedAt})` })
      .from(golfGolfers)
    const age = freshest?.newest ? now.getTime() - new Date(freshest.newest).getTime() : Infinity
    if (force || age >= GOLFER_MAX_AGE_MS) {
      try {
        const r = await syncGolfers(db, now.getFullYear())
        golferSync = { ran: true, ...r }
      } catch (err) {
        // Never let this sink the score sync — stale golfers are far
        // better than no scores.
        golferSync = { ran: true, failed: err instanceof Error ? err.message : String(err) }
      }
    } else {
      golferSync = { ran: false, ageHours: Math.round(age / 3600000) }
    }

    const candidates = await db
      .select()
      .from(golfTournaments)
      .where(inArray(golfTournaments.status, ['upcoming', 'active']))

    const report: Array<Record<string, unknown>> = []

    for (const t of candidates) {
      if (onlyTournamentId && t.id !== onlyTournamentId) continue
      // Window opens 4 days early for field/tee-time discovery (the
      // SlashGolf leaderboard 400s until the entry list exists — that's
      // handled as a per-tournament soft failure below) and stays open 4
      // days past the end date: an event is only dropped once it reports
      // Official, which can land well after the final putt.
      const windowStart = t.startDate.getTime() - 4 * 24 * 60 * 60 * 1000
      const windowEnd = t.endDate.getTime() + 4 * 24 * 60 * 60 * 1000
      if (!force && (now.getTime() < windowStart || now.getTime() > windowEnd)) continue
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
      if (!force && (local.hour < PLAY_START_HOUR || local.hour > PLAY_END_HOUR)) {
        report.push({ tournament: t.name, skipped: `outside play hours (local ${local.hour}:00)` })
        continue
      }

      if (t.lastSyncedAt && !force && now.getTime() - t.lastSyncedAt.getTime() < MIN_GAP_MS) {
        report.push({ tournament: t.name, skipped: 'synced within the last hour' })
        continue
      }

      try {
        const result = await syncTournament(db, t, { withScorecards: true })
        report.push({ tournament: t.name, localHour: local.hour, ...result })
      } catch (err) {
        // Pre-event 400s (no entry list yet) and transient failures must
        // not break the other tournaments' syncs.
        report.push({
          tournament: t.name,
          localHour: local.hour,
          failed: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return res.status(200).json({ ranAt: now.toISOString(), golfers: golferSync, tournaments: report })
  } catch (error) {
    console.error('GET /api/cron/sync-all error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
