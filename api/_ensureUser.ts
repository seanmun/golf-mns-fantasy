import { createClerkClient } from '@clerk/backend'
import { db } from './_db.js'
import { users } from '../src/lib/db/schema.js'

// Anything that writes a row keyed to a user must guarantee the user
// exists first. The client-side sync is fire-and-forget, so a brand-new
// account can reach an endpoint before its row lands — which used to
// fail the pool join outright.
export async function ensureUser(userId: string): Promise<void> {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
  const user = await clerk.users.getUser(userId)
  const email = user.emailAddresses[0]?.emailAddress || ''
  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(' ') || email.split('@')[0] || 'Player'
  const avatarUrl = user.imageUrl || null

  await db
    .insert(users)
    .values({ id: userId, email, displayName, avatarUrl })
    .onConflictDoUpdate({
      target: users.id,
      set: { email, displayName, avatarUrl },
    })
}
