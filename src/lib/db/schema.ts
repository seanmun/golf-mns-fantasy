import {
  pgTable, pgSchema, text, integer, boolean, timestamp,
  uuid, decimal, jsonb, index, unique,
} from 'drizzle-orm/pg-core'

// All golf tables live in the `golf` Postgres schema; shared cross-game
// tables stay in `public`.
export const golfSchema = pgSchema('golf')

// ─── USERS ────────────────────────────────────────────────────────────────────

// Shared cross-game identity table in `public` (same definition as the
// wnba app). email is NOT unique in the live table. Not managed by this
// app's db:push (schemaFilter is ['golf']).
export const users = pgTable('users', {
  id: text('id').primaryKey(), // Clerk user ID
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  role: text('role').notNull().default('owner'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ─── TOURNAMENTS ──────────────────────────────────────────────────────────────

export const golfTournaments = golfSchema.table('tournaments', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  course: text('course').notNull(),
  location: text('location'),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  lockTime: timestamp('lock_time').notNull(),
  status: text('status').notNull().default('upcoming'), // upcoming | active | completed | cancelled
  season: integer('season').notNull(),
  externalId: text('external_id'),
  lastSyncedAt: timestamp('last_synced_at'),
  // Last time the stat-detail (scorecard) pass ran, vs the cheaper
  // leaderboard-only sync tracked by lastSyncedAt.
  lastFullSyncAt: timestamp('last_full_sync_at'),
  // IANA timezone of the venue (from SlashGolf tournament info, e.g.
  // "America/Chicago"). All day-boundary and sync-window decisions are
  // made in THIS timezone, never UTC — see api/cron/sync-all.ts.
  timeZone: text('time_zone'),
  // Flips true the first time the leaderboard reports anyone as cut,
  // which is the only observable proof this event HAS a cut and that it
  // has happened. Gates made_cut_bonus: false through rounds 1–2, and
  // false forever at no-cut events like the FedEx playoffs.
  cutApplied: boolean('cut_applied').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ─── GOLFERS ──────────────────────────────────────────────────────────────────

export interface GolferSeasonStats {
  season: number
  events: number
  wins: number
  top10s: number
  cutsMade: number
  birdies: number
  eagles: number
  fpts: number
  avgFpts: number
}

export const golfGolfers = golfSchema.table('golfers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  country: text('country'),
  worldRanking: integer('world_ranking'),
  photoUrl: text('photo_url'),
  externalId: text('external_id').unique(),
  isActive: boolean('is_active').notNull().default(true),
  // Aggregated from golf.golfer_results by recomputeSeasonStats.
  seasonStats: jsonb('season_stats').$type<GolferSeasonStats>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Bumped by the OWGR sync. The cron reads the newest value to decide
  // whether golfers are stale enough to re-pull, so it needs no extra
  // bookkeeping table.
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ─── TOURNAMENT FIELD ─────────────────────────────────────────────────────────

export const golfTournamentField = golfSchema.table('tournament_field', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id').notNull().references(() => golfTournaments.id),
  golferId: uuid('golfer_id').notNull().references(() => golfGolfers.id),
  isCut: boolean('is_cut').notNull().default(false),
  isWithdrawn: boolean('is_withdrawn').notNull().default(false),
  // Latest tee time string from the leaderboard (e.g. "2:20pm"),
  // refreshed each sync — pre-event it's the round-1 tee time.
  teeTime: text('tee_time'),
}, (t) => [
  index('golf_field_tournament_idx').on(t.tournamentId),
])

// ─── GOLFER ROUND RESULTS ─────────────────────────────────────────────────────

// Hole-by-hole data per round, stored when the scorecard pass runs
// (picked golfers only). holes is keyed "1".."18".
export interface StoredScorecardRound {
  round: number
  holes: Record<string, { score: number; par: number }>
  strokes: number
}

export const golfGolferResults = golfSchema.table('golfer_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id').notNull().references(() => golfTournaments.id),
  golferId: uuid('golfer_id').notNull().references(() => golfGolfers.id),
  round1Score: integer('round1_score'),
  round2Score: integer('round2_score'),
  round3Score: integer('round3_score'),
  round4Score: integer('round4_score'),
  totalScore: integer('total_score'),
  position: integer('position'),
  isCut: boolean('is_cut').notNull().default(false),
  // Tracked on tournament_field too, but scoring reads THIS table — so
  // without a copy here a withdrawal still collected the cut bonus.
  isWithdrawn: boolean('is_withdrawn').notNull().default(false),
  holeInOnes: integer('hole_in_ones').notNull().default(0),
  albatrosses: integer('albatrosses').notNull().default(0),
  eagles: integer('eagles').notNull().default(0),
  birdies: integer('birdies').notNull().default(0),
  pars: integer('pars').notNull().default(0),
  bogeys: integer('bogeys').notNull().default(0),
  doubleBogeys: integer('double_bogeys').notNull().default(0),
  worseThanDouble: integer('worse_than_double').notNull().default(0),
  scorecards: jsonb('scorecards').$type<StoredScorecardRound[]>(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('golf_results_tournament_golfer_idx').on(t.tournamentId, t.golferId),
])

// ─── POOLS ────────────────────────────────────────────────────────────────────

export const golfPools = golfSchema.table('pools', {
  id: uuid('id').primaryKey().defaultRandom(),
  // The FIRST event this pool scores. Single-event pools have only this
  // one; a multi-week pool also has a row per event in pool_tournaments,
  // and this always points at the earliest of them. Keeping it that way
  // is what lets every "when does this lock / what event is this"
  // query stay correct without knowing multi-week pools exist.
  tournamentId: uuid('tournament_id').notNull().references(() => golfTournaments.id),
  name: text('name').notNull(),
  description: text('description'),
  createdBy: text('created_by').notNull().references(() => users.id),
  rosterSize: integer('roster_size').notNull().default(6),
  maxEntries: integer('max_entries'),
  isPublic: boolean('is_public').notNull().default(true),
  joinCode: text('join_code').unique(),
  status: text('status').notNull().default('open'), // open | locked | active | completed | cancelled
  // pickem: anyone can pick any golfer, duplicates allowed (the original
  // behavior). draft: a snake draft where each golfer goes once, run by
  // the platform draft service — see draftId.
  pickMode: text('pick_mode').$type<'pickem' | 'draft'>().notNull().default('pickem'),
  // null = slow draft (12h per pick); otherwise seconds on the clock.
  draftPickSeconds: integer('draft_pick_seconds'),
  // Set once the draft has been created in the hub's draft service.
  draftId: uuid('draft_id'),
  // Frozen into each pool at creation, so changing this default never
  // rescores a pool that already exists. Must stay in step with
  // DEFAULT_SCORING in src/lib/scoring/engine.ts, which is what the UI
  // falls back to when rendering.
  scoringConfig: jsonb('scoring_config').notNull().default({
    hole_in_one: 15,
    albatross: 12,
    eagle: 8,
    birdie: 3,
    par: 0,
    bogey: -1,
    double_bogey: -3,
    worse_than_double: -5,
    made_cut_bonus: 2,
    position_bonuses: {
      '1': 30, '2': 20, '3': 15, '4': 12, '5': 10,
      '6': 9, '7': 8, '8': 7, '9': 6, '10': 5,
      '11': 3, '12': 3, '13': 3, '14': 3, '15': 3,
      '16': 2, '17': 2, '18': 2, '19': 2, '20': 2,
      '21': 1, '22': 1, '23': 1, '24': 1, '25': 1,
      '26': 1, '27': 1, '28': 1, '29': 1, '30': 1,
    },
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ─── POOL TOURNAMENTS ─────────────────────────────────────────────────────────

// Every event a pool scores, in play order. A one-week pool has a single
// row; a multi-week pool (e.g. the three FedEx playoff events) has one
// per event and sums points across all of them.
//
// sortOrder 0 is always the same event as pools.tournamentId — the one
// whose lock time locks the pool and whose field the draft is built from.
export const golfPoolTournaments = golfSchema.table('pool_tournaments', {
  id: uuid('id').primaryKey().defaultRandom(),
  poolId: uuid('pool_id').notNull().references(() => golfPools.id),
  tournamentId: uuid('tournament_id').notNull().references(() => golfTournaments.id),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [
  unique('golf_pool_tournaments_pool_tournament_key').on(t.poolId, t.tournamentId),
  index('golf_pool_tournaments_pool_idx').on(t.poolId),
  // The sync's reverse lookup: which pools care about this event?
  index('golf_pool_tournaments_tournament_idx').on(t.tournamentId),
])

// ─── POOL ENTRIES ─────────────────────────────────────────────────────────────

export const golfPoolEntries = golfSchema.table('pool_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  poolId: uuid('pool_id').notNull().references(() => golfPools.id),
  userId: text('user_id').notNull().references(() => users.id),
  golferIds: jsonb('golfer_ids').notNull().default([]),
  totalPoints: decimal('total_points', { precision: 10, scale: 2 }).notNull().default('0'),
  rank: integer('rank'),
  isLocked: boolean('is_locked').notNull().default(false),
  submittedAt: timestamp('submitted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('golf_entries_pool_user_idx').on(t.poolId, t.userId),
])

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type GolfUser = typeof users.$inferSelect
export type GolfTournament = typeof golfTournaments.$inferSelect
export type GolfGolfer = typeof golfGolfers.$inferSelect
export type GolfTournamentField = typeof golfTournamentField.$inferSelect
export type GolfGolferResults = typeof golfGolferResults.$inferSelect
export type GolfPool = typeof golfPools.$inferSelect
export type GolfPoolTournament = typeof golfPoolTournaments.$inferSelect
export type GolfPoolEntry = typeof golfPoolEntries.$inferSelect
export type NewGolfPool = typeof golfPools.$inferInsert
export type NewGolfPoolEntry = typeof golfPoolEntries.$inferInsert
