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

- **Pools** are one-off tournament contests. `pickMode` is `pickem`
  (anyone picks anyone, duplicates allowed) or `draft` (snake, each
  golfer once).
- **Golf owns** pools, entries, rosters, scoring, and the leaderboard.
- **The hub owns the draft** — order, clock, picks. Golf talks to it
  through `api/_draftService.ts` with `DRAFT_SERVICE_SECRET`, then copies
  finished picks into `golf.pool_entries` so scoring works unchanged.
- Pool creators are members of their own pool automatically.

## Scoring

Points come from hole-by-hole scorecards, not summary stats. An ace
scores as hole-in-one only — never also as eagle or albatross, which
would double-pay it. `made_cut_bonus` is awarded whenever a golfer is not
cut, which means it is already showing during rounds 1–2 before any cut
exists.

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
