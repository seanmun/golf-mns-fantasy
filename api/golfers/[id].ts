import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db.js'
import { golfGolfers } from '../../src/lib/db/schema.js'
import { eq } from 'drizzle-orm'

interface TournamentResult {
  tournamentName: string
  tournamentDate: string
  rank: number | null
  totalScore: number | null
  earnings: number | null
  birdies: number
  eagles: number
  pars: number
  bogeys: number
  doubleBogeys: number
  holeInOnes: number
  madeCut: boolean
  rounds: number
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { id } = req.query

    const [golfer] = await db
      .select()
      .from(golfGolfers)
      .where(eq(golfGolfers.id, id as string))
      .limit(1)

    if (!golfer) return res.status(404).json({ error: 'Golfer not found' })

    // If no externalId, return golfer without tournament results
    if (!golfer.externalId) {
      return res.status(200).json({ golfer, results: [] })
    }

    const apiKey = process.env.GOLF_API_KEY
    const baseUrl = process.env.GOLF_API_BASE_URL || 'https://api.sportsdata.io/golf/v2/json'

    if (!apiKey) {
      return res.status(200).json({ golfer, results: [] })
    }

    // Fetch 2025 tournaments
    const tournamentsRes = await fetch(`${baseUrl}/Tournaments/2025?key=${apiKey}`)
    if (!tournamentsRes.ok) {
      return res.status(200).json({ golfer, results: [] })
    }

    const tournaments: any[] = await tournamentsRes.json()

    // Get the last 8 completed tournaments
    const completed = tournaments
      .filter((t: any) => t.IsOver === true)
      .sort((a: any, b: any) => new Date(b.StartDate).getTime() - new Date(a.StartDate).getTime())
      .slice(0, 8)

    // Fetch leaderboards in parallel
    const leaderboardPromises = completed.map(async (t: any) => {
      try {
        const res = await fetch(`${baseUrl}/Leaderboard/${t.TournamentID}?key=${apiKey}`)
        if (!res.ok) return null
        const data = await res.json()
        return { tournament: t, leaderboard: data }
      } catch {
        return null
      }
    })

    const leaderboards = await Promise.all(leaderboardPromises)

    // Find this golfer in each leaderboard
    const results: TournamentResult[] = []
    for (const lb of leaderboards) {
      if (!lb) continue
      const player = lb.leaderboard.Players?.find(
        (p: any) => String(p.PlayerID) === golfer.externalId
      )
      if (!player) continue

      results.push({
        tournamentName: lb.tournament.Name,
        tournamentDate: lb.tournament.StartDate,
        rank: player.Rank != null ? Math.round(player.Rank) : null,
        totalScore: player.TotalScore != null ? Math.round(player.TotalScore) : null,
        earnings: player.Earnings != null ? Math.round(player.Earnings) : null,
        birdies: Math.round(player.Birdies || 0),
        eagles: Math.round(player.Eagles || 0),
        pars: Math.round(player.Pars || 0),
        bogeys: Math.round(player.Bogeys || 0),
        doubleBogeys: Math.round(player.DoubleBogeys || 0),
        holeInOnes: Math.round(player.HoleInOnes || 0),
        madeCut: player.MadeCut > 0,
        rounds: player.Rounds?.length || 0,
      })
    }

    // Sort oldest to newest for chart display
    results.sort((a, b) => new Date(a.tournamentDate).getTime() - new Date(b.tournamentDate).getTime())

    return res.status(200).json({ golfer, results })
  } catch (error) {
    console.error('GET /api/golfers/[id] error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
