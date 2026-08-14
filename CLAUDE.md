# golf-mns-fantasy

PGA fantasy on `golf.mnsfantasy.com`. Vite + React + Vercel functions +
Neon (`golf` schema). Platform-wide rules live in the workspace
`CLAUDE.md` one level up — read that first.

## Running it locally

```
vercel dev          # NOT npm run dev — that cannot serve /api
```

`.env.local` needs `pk_test_`/`sk_test_` Clerk keys, and ideally a Neon
branch in `DATABASE_URL` so testing does not write into live pools.

Set `PLATFORM_API_URL` if you touch drafts. It defaults to
`https://mnsfantasy.com`, so without it a local draft mutates the real
one.

## Shape

- **Pools** are tournament contests. `pickMode` is `pickem` (anyone
  picks anyone, duplicates allowed) or `draft` (snake, each golfer once).
- A pool spans **one or more events**, listed in `golf.pool_tournaments`
  in play order. `pools.tournament_id` always points at the *first* of
  them, which is what lets every "when does this lock / what event is
  this" query stay correct without knowing multi-week pools exist.
- **Golf owns** pools, entries, rosters, scoring, and the leaderboard.
- **The hub owns the draft** — order, clock, picks. Golf talks to it
  through `api/_draftService.ts` with `DRAFT_SERVICE_SECRET`, then copies
  finished picks into `golf.pool_entries` so scoring works unchanged.
- Pool creators are members of their own pool automatically.

## Multi-week pools

One draft before the first event; the roster rides every event and
points accumulate. Everything that reads a pool's events must go through
`src/lib/db/poolTournaments.ts`, never `pools.tournament_id` alone.

The trap is the **reverse** direction. `syncTournament` finds pools for
the event it just synced; matching on `pools.tournament_id` makes a
three-week pool invisible in weeks 2 and 3 — no scorecard pass for its
drafted golfers, no rescore, no status change. It freezes on week-1
points and looks like a scoring bug. Use `poolIdsForTournament`.

A pool **locks** when its first event does and is only **completed**
when its last one is. Completing on any single event closes a
multi-week pool early and stops it scoring.

The draftable field is the union of every event's field. For the FedEx
playoffs that is week 1 and nothing else — the BMW and TOUR Championship
entry lists don't exist until the prior event ends. That's the game: you
draft the 70, and each pick scores only as long as they keep advancing.

## Scoring

Points come from hole-by-hole scorecards, not summary stats. An ace
scores as hole-in-one only — never also as eagle or albatross, which
would double-pay it.

`made_cut_bonus` pays only when `tournaments.cutApplied` is true and the
golfer is neither cut nor withdrawn. `cutApplied` latches on the first
time the leaderboard reports **anyone** as cut — the only observable
proof an event has a cut and that it has landed. It stays false all week
at a no-cut event, which is why the FedEx playoffs don't pay it.

It used to be `if (!is_cut)`, which paid every golfer from round 1 and
clawed it back on Friday, paid withdrawals (status `wd` is not `cut`),
and paid in full at no-cut events. `seasonStats.cutsMade` had the same
bug. If you touch this, keep `PointsBreakdown` in PoolLeaderboard.tsx in
step — it recomputes the same bonus client-side and the breakdown must
add up to the total above it.

Placement pays to 30th and **ties take the full value**: `parsePosition`
maps `"T3"` to `3`, so a five-way T3 is five × the 3rd-place bonus.

Finish bonuses require `event_final` (the tournament being `completed`).
`position` is rewritten on every sync, so mid-round it is a LIVE
standing — without the gate, a player three holes into Thursday sat in
first and collected the winner's bonus, then lost it an hour later.
Both tournament-level flags travel together in `EventState`
(`{ cutApplied, eventFinal }`) rather than as loose booleans, because
two adjacent bare booleans are trivially passed in the wrong order.

Each event in a pool scores independently and the totals add — so a
golfer who plays all three playoff events can earn up to three finish
bonuses. That is intended. `golfer_results` has no unique constraint on
`(tournament_id, golfer_id)`, so `recalculatePool` dedupes per event
before summing; without that a stray duplicate row would double-pay.

Rosters are **per event**, not per pool: `golf.pool_entry_rosters` holds
who counted for a team at each tournament, so a waiver can move a golfer
without rewriting history. A dropped golfer keeps the points he already
earned and scores nothing after; an added one scores nothing before.
Read it through `src/lib/db/entryRosters.ts`, never `golferIds` — that
column is now only the current roster, kept for display.

Scoring is **frozen into each pool at creation** (`pools.scoring_config`
jsonb). Changing the defaults never rescores an existing pool — a pool
created before a change keeps the old numbers. There are two defaults
that must stay in step: the column default in `schema.ts` (what new
pools get) and `DEFAULT_SCORING` in `engine.ts` (what the UI falls back
to). Nothing exposes `scoringConfig` for editing yet.

`api/scoring/recalculate.ts` must stay a thin wrapper over
`recalculatePool`. It used to carry its own copy of the maths, and that
copy was single-event.

## Live data

SlashGolf (Live Golf Data via RapidAPI), key `RAPIDAPI_KEY`. Responses
are MongoDB extended JSON — use `num()` / `ts()` in `api/_slashgolf.ts`
to unwrap them.

Sync windows are computed in the **venue's** timezone, never UTC. The
cron fires hourly per UTC hour and each tournament decides whether it is
inside its own local play window.

`GOLF_API_KEY` / `GOLF_API_BASE_URL` are sportsdata.io leftovers. The
only code reading them is a dead path in `api/golfers/[id].ts` that
returns early because the key is never set. `resend` and `zustand` are
unused dependencies.

## Draft queues

A participant's queue is stored as **draft item IDs**. Anything that
recreates rows in `draft.items` invalidates every queue, so the hub
upserts on `(draftId, ref)` rather than replacing. Games re-send the full
field and participant list on every start, so participant state
(`queue`, `autodraft`) must be carried across that rewrite, not reset.

## Build

`npm run build` typechecks `src`, then `api/` via `tsconfig.api.json`,
then bundles. If you ever see the API stop being checked, that guard has
been removed — put it back.
