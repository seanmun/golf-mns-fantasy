import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db.js'
import { verifyAuth, isAdmin } from '../_middleware.js'
import { golfGolfers } from '../../src/lib/db/schema.js'
import { eq } from 'drizzle-orm'

interface SportsDataPlayer {
  PlayerID: number
  FirstName: string
  LastName: string
  Country: string | null
  PhotoUrl: string | null
}

interface SportsDataSeasonStats {
  PlayerID: number
  Name: string
  WorldGolfRank: number
  WorldGolfRankLastWeek: number
  Events: number
  AveragePoints: number
  TotalPoints: number
  Season: number
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const userId = await verifyAuth(req)
    if (!userId || !isAdmin(userId)) return res.status(403).json({ error: 'Forbidden' })

    const apiKey = process.env.GOLF_API_KEY
    const baseUrl = process.env.GOLF_API_BASE_URL || 'https://api.sportsdata.io/golf/v2/json'

    if (!apiKey) return res.status(500).json({ error: 'GOLF_API_KEY not configured' })

    const season = req.body?.season || 2025

    // Fetch season stats (has world ranking) and player details (has country, photo) in parallel
    const [statsRes, playersRes] = await Promise.all([
      fetch(`${baseUrl}/PlayerSeasonStats/${season}?key=${apiKey}`),
      fetch(`${baseUrl}/Players?key=${apiKey}`),
    ])

    if (!statsRes.ok) return res.status(502).json({ error: `SportsData stats API returned ${statsRes.status}` })
    if (!playersRes.ok) return res.status(502).json({ error: `SportsData players API returned ${playersRes.status}` })

    const seasonStats: SportsDataSeasonStats[] = await statsRes.json()
    const players: SportsDataPlayer[] = await playersRes.json()

    // Index players by ID for fast lookup
    const playerMap = new Map<number, SportsDataPlayer>()
    for (const p of players) {
      playerMap.set(p.PlayerID, p)
    }

    // Filter to ranked golfers only
    const rankedGolfers = seasonStats.filter((s) => s.WorldGolfRank > 0)

    let upserted = 0
    let skipped = 0

    for (const stat of rankedGolfers) {
      const player = playerMap.get(stat.PlayerID)
      const name = player ? `${player.FirstName} ${player.LastName}` : stat.Name
      const country = player?.Country || null
      const photoUrl = player?.PhotoUrl || null
      const externalId = String(stat.PlayerID)

      // Check if golfer already exists by externalId
      const [existing] = await db
        .select()
        .from(golfGolfers)
        .where(eq(golfGolfers.externalId, externalId))
        .limit(1)

      if (existing) {
        // Update ranking and details
        await db
          .update(golfGolfers)
          .set({
            name,
            country,
            worldRanking: stat.WorldGolfRank,
            photoUrl,
            isActive: true,
          })
          .where(eq(golfGolfers.id, existing.id))
        upserted++
      } else {
        // Insert new golfer
        await db
          .insert(golfGolfers)
          .values({
            name,
            country,
            worldRanking: stat.WorldGolfRank,
            photoUrl,
            externalId,
            isActive: true,
          })
        upserted++
      }
    }

    return res.status(200).json({
      success: true,
      season,
      totalRanked: rankedGolfers.length,
      upserted,
      skipped,
    })
  } catch (error) {
    console.error('POST /api/admin/sync-golfers error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
