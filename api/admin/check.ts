import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAuth, isAdmin } from '../_middleware.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const userId = await verifyAuth(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  return res.status(200).json({ isAdmin: isAdmin(userId) })
}
