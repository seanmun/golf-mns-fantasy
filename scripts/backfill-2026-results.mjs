// One-time backfill: import all completed 2026 tournaments and their
// leaderboard results into golf.tournaments / golf.tournament_field /
// golf.golfer_results, so per-golfer season stats can be aggregated.
// Values are Math.round()ed — trial-tier sportsdata scrambles numerics
// with decimal noise; rounding is a no-op on real data.
// Usage: node scripts/backfill-2026-results.mjs
import { config as loadEnv } from 'dotenv'
import { neon } from '@neondatabase/serverless'

loadEnv({ path: '.env.local' })
loadEnv()

const sql = neon(process.env.DATABASE_URL)
const KEY = process.env.GOLF_API_KEY
const BASE = process.env.GOLF_API_BASE_URL || 'https://api.sportsdata.io/golf/v2/json'
const SEASON = 2026

const int = (v) => Math.round(Number(v ?? 0))

const sched = await (await fetch(`${BASE}/Tournaments/${SEASON}?key=${KEY}`)).json()
const completed = sched.filter((t) => t.IsOver && !t.Canceled)
console.log(`completed ${SEASON} events:`, completed.length)

const golfers = await sql`select id, external_id from golf.golfers where external_id is not null`
const byExt = new Map(golfers.map((g) => [g.external_id, g.id]))

let events = 0
let results = 0
for (const t of completed) {
  const ext = String(t.TournamentID)
  let [row] = await sql`select id from golf.tournaments where external_id = ${ext}`
  if (!row) {
    ;[row] = await sql`
      insert into golf.tournaments (name, course, location, start_date, end_date, lock_time, season, external_id, status)
      values (${t.Name}, ${t.Venue || t.Name}, ${t.Location || null}, ${t.StartDate}, ${t.EndDate}, ${t.StartDate}, ${SEASON}, ${ext}, 'completed')
      returning id`
  } else {
    await sql`update golf.tournaments set status='completed' where id=${row.id}`
  }

  const lb = await (await fetch(`${BASE}/Leaderboard/${ext}?key=${KEY}`)).json()
  if (!lb?.Players) {
    console.log(`  ${t.Name}: no leaderboard`)
    continue
  }
  const cutApplied = true // completed events always have the cut applied
  let n = 0
  for (const p of lb.Players) {
    const golferId = byExt.get(String(p.PlayerID))
    if (!golferId) continue
    const madeCut = Number(p.MadeCut) >= 0.5
    const isCut = cutApplied && !madeCut
    const rounds = p.Rounds || []
    const rScore = (num) => {
      const r = rounds.find((x) => x.Number === num)
      return r?.Score != null ? int(r.Score) : null
    }
    const [existingField] = await sql`
      select id from golf.tournament_field where tournament_id=${row.id} and golfer_id=${golferId}`
    if (!existingField) {
      await sql`insert into golf.tournament_field (tournament_id, golfer_id, is_cut, is_withdrawn)
                values (${row.id}, ${golferId}, ${isCut}, ${!!p.IsWithdrawn})`
    }
    const [existing] = await sql`
      select id from golf.golfer_results where tournament_id=${row.id} and golfer_id=${golferId}`
    const vals = {
      r1: rScore(1), r2: rScore(2), r3: rScore(3), r4: rScore(4),
      total: p.TotalScore != null ? int(p.TotalScore) : null,
      pos: p.Rank != null ? int(p.Rank) : null,
      hio: int(p.HoleInOnes), alb: int(p.DoubleEagles), eag: int(p.Eagles),
      bir: int(p.Birdies), par: int(p.Pars), bog: int(p.Bogeys),
      dbl: int(p.DoubleBogeys), wtd: int(p.WorseThanDoubleBogey),
    }
    if (existing) {
      await sql`update golf.golfer_results set
        round1_score=${vals.r1}, round2_score=${vals.r2}, round3_score=${vals.r3}, round4_score=${vals.r4},
        total_score=${vals.total}, position=${vals.pos}, is_cut=${isCut},
        hole_in_ones=${vals.hio}, albatrosses=${vals.alb}, eagles=${vals.eag}, birdies=${vals.bir},
        pars=${vals.par}, bogeys=${vals.bog}, double_bogeys=${vals.dbl}, worse_than_double=${vals.wtd},
        updated_at=now()
        where id=${existing.id}`
    } else {
      await sql`insert into golf.golfer_results
        (tournament_id, golfer_id, round1_score, round2_score, round3_score, round4_score,
         total_score, position, is_cut, hole_in_ones, albatrosses, eagles, birdies, pars,
         bogeys, double_bogeys, worse_than_double)
        values (${row.id}, ${golferId}, ${vals.r1}, ${vals.r2}, ${vals.r3}, ${vals.r4},
                ${vals.total}, ${vals.pos}, ${isCut}, ${vals.hio}, ${vals.alb}, ${vals.eag},
                ${vals.bir}, ${vals.par}, ${vals.bog}, ${vals.dbl}, ${vals.wtd})`
    }
    n++
  }
  events++
  results += n
  console.log(`  ${t.Name}: ${n} results`)
}
console.log(`backfilled ${events} events, ${results} results`)
