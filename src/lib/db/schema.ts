import {
  pgTable, text, integer, boolean, timestamp,
  uuid, decimal, jsonb, index,
} from 'drizzle-orm/pg-core'

// ─── USERS ────────────────────────────────────────────────────────────────────

export const golfUsers = pgTable('golf_users', {
  id: text('id').primaryKey(), // Clerk user ID
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ─── TOURNAMENTS ──────────────────────────────────────────────────────────────

export const golfTournaments = pgTable('golf_tournaments', {
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ─── GOLFERS ──────────────────────────────────────────────────────────────────

export const golfGolfers = pgTable('golf_golfers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  country: text('country'),
  worldRanking: integer('world_ranking'),
  photoUrl: text('photo_url'),
  externalId: text('external_id').unique(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ─── TOURNAMENT FIELD ─────────────────────────────────────────────────────────

export const golfTournamentField = pgTable('golf_tournament_field', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id').notNull().references(() => golfTournaments.id),
  golferId: uuid('golfer_id').notNull().references(() => golfGolfers.id),
  isCut: boolean('is_cut').notNull().default(false),
  isWithdrawn: boolean('is_withdrawn').notNull().default(false),
}, (t) => [
  index('golf_field_tournament_idx').on(t.tournamentId),
])

// ─── GOLFER ROUND RESULTS ─────────────────────────────────────────────────────

export const golfGolferResults = pgTable('golf_golfer_results', {
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
  holeInOnes: integer('hole_in_ones').notNull().default(0),
  albatrosses: integer('albatrosses').notNull().default(0),
  eagles: integer('eagles').notNull().default(0),
  birdies: integer('birdies').notNull().default(0),
  pars: integer('pars').notNull().default(0),
  bogeys: integer('bogeys').notNull().default(0),
  doubleBogeys: integer('double_bogeys').notNull().default(0),
  worseThanDouble: integer('worse_than_double').notNull().default(0),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('golf_results_tournament_golfer_idx').on(t.tournamentId, t.golferId),
])

// ─── POOLS ────────────────────────────────────────────────────────────────────

export const golfPools = pgTable('golf_pools', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id').notNull().references(() => golfTournaments.id),
  name: text('name').notNull(),
  description: text('description'),
  createdBy: text('created_by').notNull().references(() => golfUsers.id),
  rosterSize: integer('roster_size').notNull().default(6),
  maxEntries: integer('max_entries'),
  isPublic: boolean('is_public').notNull().default(true),
  joinCode: text('join_code').unique(),
  status: text('status').notNull().default('open'), // open | locked | active | completed | cancelled
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
    position_bonuses: { '1': 20, '2': 12, '3': 8, '4': 5, '5': 3 },
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ─── POOL ENTRIES ─────────────────────────────────────────────────────────────

export const golfPoolEntries = pgTable('golf_pool_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  poolId: uuid('pool_id').notNull().references(() => golfPools.id),
  userId: text('user_id').notNull().references(() => golfUsers.id),
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

export type GolfUser = typeof golfUsers.$inferSelect
export type GolfTournament = typeof golfTournaments.$inferSelect
export type GolfGolfer = typeof golfGolfers.$inferSelect
export type GolfTournamentField = typeof golfTournamentField.$inferSelect
export type GolfGolferResults = typeof golfGolferResults.$inferSelect
export type GolfPool = typeof golfPools.$inferSelect
export type GolfPoolEntry = typeof golfPoolEntries.$inferSelect
export type NewGolfPool = typeof golfPools.$inferInsert
export type NewGolfPoolEntry = typeof golfPoolEntries.$inferInsert
