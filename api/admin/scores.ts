import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db'
import { verifyAuth, isAdmin } from '../_middleware'
import { golfGolferResults, golfTournamentField } from '../../src/lib/db/schema'
import { eq, and } from 'drizzle-orm'

// POST /api/admin/scores
// Body: { tournamentId, scores: [{ golferId, round1Score, round2Score, round3Score, round4Score,
//   totalScore, position, isCut, holeInOnes, albatrosses, eagles, birdies, pars, bogeys, doubleBogeys, worseThanDouble }] }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const userId = await verifyAuth(req)
    if (!userId || !isAdmin(userId)) return res.status(403).json({ error: 'Forbidden' })

    const { tournamentId, scores } = req.body

    if (!tournamentId || !Array.isArray(scores)) {
      return res.status(400).json({ error: 'tournamentId and scores array required' })
    }

    let upserted = 0

    for (const score of scores) {
      const { golferId, isCut, ...rest } = score

      // Update tournament field cut status
      await db
        .update(golfTournamentField)
        .set({ isCut: isCut || false })
        .where(
          and(
            eq(golfTournamentField.tournamentId, tournamentId),
            eq(golfTournamentField.golferId, golferId)
          )
        )

      // Upsert golfer results
      const existing = await db
        .select()
        .from(golfGolferResults)
        .where(
          and(
            eq(golfGolferResults.tournamentId, tournamentId),
            eq(golfGolferResults.golferId, golferId)
          )
        )
        .limit(1)

      if (existing.length > 0) {
        await db
          .update(golfGolferResults)
          .set({ ...rest, isCut: isCut || false, updatedAt: new Date() })
          .where(eq(golfGolferResults.id, existing[0].id))
      } else {
        await db
          .insert(golfGolferResults)
          .values({ tournamentId, golferId, isCut: isCut || false, ...rest })
      }

      upserted++
    }

    return res.status(200).json({ success: true, upserted })
  } catch (error) {
    console.error('POST /api/admin/scores error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
