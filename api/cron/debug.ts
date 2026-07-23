import type { VercelRequest, VercelResponse } from '@vercel/node'

// Temporary diagnostic for CRON_SECRET wiring. Reveals lengths and
// presence only — never values. Remove after debugging.
export default function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.authorization
  return res.status(200).json({
    hasSecret: !!secret,
    secretLength: secret?.length ?? 0,
    hasAuthHeader: !!auth,
    authHeaderLength: auth?.length ?? 0,
    authStartsWithBearer: auth?.startsWith('Bearer ') ?? false,
    matches: !!secret && auth === `Bearer ${secret}`,
  })
}
