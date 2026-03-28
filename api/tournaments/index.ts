import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db.js'
import { golfTournaments } from '../../src/lib/db/schema.js'
import { eq } from 'drizzle-orm'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { status, season } = req.query
    let query = db.select().from(golfTournaments)

    const tournaments = await query
    const filtered = tournaments.filter((t) => {
      if (status && t.status !== status) return false
      if (season && t.season !== Number(season)) return false
      return true
    })

    return res.status(200).json({ tournaments: filtered })
  } catch (error) {
    console.error('GET /api/tournaments error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
