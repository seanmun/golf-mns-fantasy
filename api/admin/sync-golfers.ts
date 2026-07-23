import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db.js'
import { verifyAuth, isAdmin } from '../_middleware.js'
import { golfGolfers } from '../../src/lib/db/schema.js'
import { eq } from 'drizzle-orm'
import { sgFetch, num, type SgRankings } from '../_slashgolf.js'
import { recomputeSeasonStats } from '../../src/lib/scoring/seasonStats.js'

// Pull the current OWGR (SlashGolf stats endpoint, statId 186) and
// upsert golfers by SlashGolf playerId. Existing photo/country data is
// preserved — SlashGolf has no photos.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const userId = await verifyAuth(req)
    if (!userId || !isAdmin(userId)) return res.status(403).json({ error: 'Forbidden' })

    const season: number = req.body?.season || new Date().getFullYear()
    const wgr = await sgFetch<SgRankings>(`stats?year=${season}&statId=186`)
    if (!wgr.rankings?.length) {
      return res.status(502).json({ error: 'SlashGolf OWGR returned no rankings' })
    }

    let updated = 0
    let created = 0

    for (const r of wgr.rankings) {
      const rank = num(r.rank)
      const [existing] = await db
        .select({ id: golfGolfers.id })
        .from(golfGolfers)
        .where(eq(golfGolfers.externalId, String(r.playerId)))
        .limit(1)

      if (existing) {
        await db
          .update(golfGolfers)
          .set({ name: r.fullName, worldRanking: rank, isActive: true })
          .where(eq(golfGolfers.id, existing.id))
        updated++
      } else {
        await db.insert(golfGolfers).values({
          name: r.fullName,
          worldRanking: rank,
          externalId: String(r.playerId),
          isActive: true,
        })
        created++
      }
    }

    const statsUpdated = await recomputeSeasonStats(db, season)

    return res.status(200).json({
      success: true,
      source: 'slashgolf-owgr',
      season,
      totalRanked: wgr.rankings.length,
      updated,
      created,
      statsUpdated,
    })
  } catch (error) {
    console.error('POST /api/admin/sync-golfers error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
