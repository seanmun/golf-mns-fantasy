import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../_db.js'
import { verifyAuth } from '../_middleware.js'
import {
  golfPools,
  golfPoolEntries,
  golfTournaments,
  golfTournamentField,
  golfGolfers,
  users,
} from '../../src/lib/db/schema.js'
import { poolTournamentIds, poolTournamentRows } from '../../src/lib/db/poolTournaments.js'
import {
  createDraft,
  controlDraft,
  getDraftState,
  findDraftByScope,
} from '../_draftService.js'

// POST /api/pools/draft { poolId, action }
//   create — build the draft in the hub from this pool's entries and the
//            tournament field, then store its id on the pool
//   refresh_field — replace the item pool from the latest field
//   start / pause / resume
//   sync   — pull completed picks back into pool entries
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const userId = await verifyAuth(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const { poolId, action } = req.body ?? {}
  if (!poolId || !action) return res.status(400).json({ error: 'poolId and action are required' })

  try {
    const [pool] = await db.select().from(golfPools).where(eq(golfPools.id, poolId)).limit(1)
    if (!pool) return res.status(404).json({ error: 'Pool not found' })
    if (pool.createdBy !== userId) {
      return res.status(403).json({ error: 'Only the pool owner can manage the draft' })
    }
    if (pool.pickMode !== 'draft') {
      return res.status(400).json({ error: 'This pool is a pick’em, not a draft' })
    }

    const [tournament] = await db
      .select()
      .from(golfTournaments)
      .where(eq(golfTournaments.id, pool.tournamentId))
      .limit(1)
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' })

    // A multi-week pool drafts once, before its first event, and the
    // roster rides every event. Name the draft for the whole slate so
    // the lobby and the on-the-clock emails say what people are playing.
    const slate = await poolTournamentRows(db, pool)
    const draftName =
      slate.length > 1
        ? `${pool.name} · ${tournament.name} +${slate.length - 1} more`
        : `${pool.name} · ${tournament.name}`

    // Draft order = join order, rebuilt from whoever is in the pool
    // right now. Called again at start time so late joiners get a slot.
    const buildParticipants = async () => {
      const entries = await db
        .select({
          userId: golfPoolEntries.userId,
          displayName: users.displayName,
          email: users.email,
        })
        .from(golfPoolEntries)
        .innerJoin(users, eq(golfPoolEntries.userId, users.id))
        .where(eq(golfPoolEntries.poolId, pool.id))
        .orderBy(golfPoolEntries.createdAt)
      return entries.map((e, i) => ({
        userId: e.userId,
        email: e.email,
        teamName: e.displayName || `Team ${i + 1}`,
        slot: i + 1,
      }))
    }

    // The draftable pool is the field of every event this pool scores —
    // golfers not playing any of them never enter the draft.
    //
    // For the FedEx playoffs that is week 1's field and nothing else:
    // the BMW and TOUR Championship entry lists don't exist until the
    // prior event finishes. That is the game, not a gap — you draft 70
    // players deep and each pick keeps scoring only as long as they keep
    // advancing.
    const buildItems = async () => {
      const tournamentIds = await poolTournamentIds(db, pool)
      const field = await db
        .select({
          id: golfGolfers.id,
          name: golfGolfers.name,
          worldRanking: golfGolfers.worldRanking,
          country: golfGolfers.country,
          seasonStats: golfGolfers.seasonStats,
          teeTime: golfTournamentField.teeTime,
          tournamentId: golfTournamentField.tournamentId,
        })
        .from(golfTournamentField)
        .innerJoin(golfGolfers, eq(golfTournamentField.golferId, golfGolfers.id))
        .where(
          and(
            inArray(golfTournamentField.tournamentId, tournamentIds),
            eq(golfTournamentField.isWithdrawn, false)
          )
        )
      // One item per golfer even if they're in several fields. The tee
      // time shown is the earliest event's — the one being drafted for.
      const order = new Map(tournamentIds.map((id, i) => [id, i]))
      const byGolfer = new Map<string, (typeof field)[number]>()
      for (const g of field) {
        const seen = byGolfer.get(g.id)
        if (
          !seen ||
          (order.get(g.tournamentId) ?? Infinity) < (order.get(seen.tournamentId) ?? Infinity)
        ) {
          byGolfer.set(g.id, g)
        }
      }
      return [...byGolfer.values()].map((g) => ({
        ref: g.id,
        name: g.name,
        rankHint: g.worldRanking ?? null,
        meta: {
          country: g.country,
          worldRanking: g.worldRanking,
          teeTime: g.teeTime,
          seasonStats: g.seasonStats,
        },
      }))
    }

    const GAME_SLUG = 'golf-masters-2026'

    if (action === 'create') {
      if (pool.draftId) return res.status(409).json({ error: 'Draft already created' })

      // If a previous attempt created the draft but failed before saving
      // its id, adopt it rather than wedging on the hub's 409.
      const existing = await findDraftByScope(GAME_SLUG, 'pool', pool.id).catch(() => null)
      if (existing?.draft) {
        await db
          .update(golfPools)
          .set({ draftId: existing.draft.id, updatedAt: new Date() })
          .where(eq(golfPools.id, pool.id))
        return res.status(200).json({ draftId: existing.draft.id, adopted: true })
      }

      const participants = await buildParticipants()
      if (participants.length < 2) {
        return res.status(400).json({ error: 'Need at least 2 entries before drafting' })
      }

      const items = await buildItems()
      if (items.length === 0) {
        return res.status(400).json({ error: 'The field for this event has not been published yet' })
      }

      const appUrl = process.env.VITE_APP_URL || 'https://golf.mnsfantasy.com'
      const { draft } = await createDraft({
        gameSlug: GAME_SLUG,
        scopeType: 'pool',
        scopeId: pool.id,
        name: draftName,
        lobbyUrl: `${appUrl}/pools/${pool.id}/draft`,
        mode: 'draft',
        orderType: 'snake',
        rounds: pool.rosterSize,
        pickSeconds: pool.draftPickSeconds,
        slowPickHours: 12,
        createdBy: userId,
        participants,
        items,
      })

      await db
        .update(golfPools)
        .set({ draftId: draft.id, updatedAt: new Date() })
        .where(eq(golfPools.id, pool.id))
      return res.status(201).json({ draftId: draft.id })
    }

    if (!pool.draftId) return res.status(400).json({ error: 'No draft has been created yet' })

    if (action === 'refresh_field') {
      const items = await buildItems()
      await controlDraft(pool.draftId, { action: 'set_items', items })
      return res.status(200).json({ ok: true, items: items.length })
    }

    if (action === 'start') {
      // Everything the pool owns can change between creating and
      // starting a draft — who joined, the roster size, the pick clock,
      // and the event field. Re-send all of it so the draft can never
      // run on stale settings, then start.
      const participants = await buildParticipants()
      if (participants.length < 2) {
        return res.status(400).json({ error: 'Need at least 2 entries before drafting' })
      }
      const items = await buildItems()
      if (items.length === 0) {
        return res.status(400).json({ error: 'The field for this event has not been published yet' })
      }
      await controlDraft(pool.draftId, { action: 'set_participants', participants })
      await controlDraft(pool.draftId, { action: 'set_items', items })
      await controlDraft(pool.draftId, {
        action: 'set_config',
        rounds: pool.rosterSize,
        pickSeconds: pool.draftPickSeconds,
        name: draftName,
      })
      const result = await controlDraft(pool.draftId, { action: 'start' })
      return res.status(200).json(result)
    }

    // Start over: clear the board and any rosters it wrote, then
    // re-sync everything so the next start uses current settings.
    if (action === 'restart') {
      await controlDraft(pool.draftId, { action: 'reset' })
      await db
        .update(golfPoolEntries)
        .set({ golferIds: [], submittedAt: null, updatedAt: new Date() })
        .where(eq(golfPoolEntries.poolId, pool.id))
      const participants = await buildParticipants()
      const items = await buildItems()
      if (participants.length >= 2) {
        await controlDraft(pool.draftId, { action: 'set_participants', participants })
      }
      if (items.length > 0) {
        await controlDraft(pool.draftId, { action: 'set_items', items })
      }
      await controlDraft(pool.draftId, {
        action: 'set_config',
        rounds: pool.rosterSize,
        pickSeconds: pool.draftPickSeconds,
        name: draftName,
      })
      return res.status(200).json({ ok: true, participants: participants.length, items: items.length })
    }

    if (action === 'pause' || action === 'resume') {
      const result = await controlDraft(pool.draftId, { action })
      return res.status(200).json(result)
    }

    // Write draft results into pool entries so scoring, the leaderboard
    // and everything downstream work unchanged. Also runs automatically
    // from /api/pools/draft-sync the moment a draft completes, so nobody
    // has to remember to click anything.
    if (action === 'sync') {
      const result = await syncDraftToEntries(pool.id, pool.draftId)
      return res.status(200).json({ ok: true, ...result })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (error) {
    console.error('POST /api/pools/draft error:', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    })
  }
}

// Copy every made pick into its owner's pool entry.
export async function syncDraftToEntries(poolId: string, draftId: string) {
  const state = (await getDraftState(draftId)) as {
    draft: { status: string }
    participants: Array<{ id: string; userId: string }>
    board: Array<{ participantId: string; item: { ref: string } | null }>
  }
  const byParticipant = new Map(state.participants.map((p) => [p.id, p.userId]))
  const picksByUser = new Map<string, string[]>()
  for (const slot of state.board) {
    if (!slot.item) continue
    const uid = byParticipant.get(slot.participantId)
    if (!uid) continue
    const list = picksByUser.get(uid) ?? []
    list.push(slot.item.ref)
    picksByUser.set(uid, list)
  }

  let entriesUpdated = 0
  for (const [uid, golferIds] of picksByUser) {
    await db
      .update(golfPoolEntries)
      .set({ golferIds, submittedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(golfPoolEntries.poolId, poolId), eq(golfPoolEntries.userId, uid)))
    entriesUpdated++
  }
  return { draftStatus: state.draft.status, entriesUpdated }
}
