import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../_db'
import { verifyAuth } from '../_middleware'
import { createClerkClient } from '@clerk/backend'
import { golfUsers } from '../../src/lib/db/schema'
import { eq } from 'drizzle-orm'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const userId = await verifyAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })

    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
    const user = await clerk.users.getUser(userId)

    const email = user.emailAddresses[0]?.emailAddress || ''
    const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || email.split('@')[0]
    const avatarUrl = user.imageUrl || null

    await db
      .insert(golfUsers)
      .values({ id: userId, email, displayName, avatarUrl })
      .onConflictDoUpdate({
        target: golfUsers.id,
        set: { email, displayName, avatarUrl },
      })

    return res.status(200).json({ success: true })
  } catch (error) {
    console.error('POST /api/users/sync error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
