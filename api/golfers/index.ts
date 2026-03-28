import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db.js'
import { golfGolfers, golfTournamentField } from '../../src/lib/db/schema.js'
import { eq, ilike, and } from 'drizzle-orm'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { search, tournamentId } = req.query

    if (tournamentId) {
      // Return field for a specific tournament
      const field = await db
        .select({
          id: golfGolfers.id,
          name: golfGolfers.name,
          country: golfGolfers.country,
          worldRanking: golfGolfers.worldRanking,
          photoUrl: golfGolfers.photoUrl,
          isCut: golfTournamentField.isCut,
          isWithdrawn: golfTournamentField.isWithdrawn,
        })
        .from(golfTournamentField)
        .innerJoin(golfGolfers, eq(golfTournamentField.golferId, golfGolfers.id))
        .where(
          and(
            eq(golfTournamentField.tournamentId, tournamentId as string),
            eq(golfTournamentField.isWithdrawn, false)
          )
        )
        .orderBy(golfGolfers.worldRanking)

      return res.status(200).json({ golfers: field })
    }

    // Return all active golfers
    let golfers = await db
      .select()
      .from(golfGolfers)
      .where(eq(golfGolfers.isActive, true))
      .orderBy(golfGolfers.worldRanking)

    if (search) {
      const term = (search as string).toLowerCase()
      golfers = golfers.filter((g) => g.name.toLowerCase().includes(term))
    }

    return res.status(200).json({ golfers })
  } catch (error) {
    console.error('GET /api/golfers error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
