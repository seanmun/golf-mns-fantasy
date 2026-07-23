// SlashGolf (Live Golf Data via RapidAPI) client.
// Responses use MongoDB extended JSON: numbers arrive as
// {"$numberInt":"5"} / {"$numberDouble":"1.5"} and dates as
// {"$date":{"$numberLong":"..."}}. num()/ts() unwrap both.

const HOST = 'live-golf-data.p.rapidapi.com'

export function num(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('$numberInt' in o) return Number(o.$numberInt)
    if ('$numberLong' in o) return Number(o.$numberLong)
    if ('$numberDouble' in o) return Number(o.$numberDouble)
  }
  return null
}

export function ts(v: unknown): Date | null {
  if (v == null) return null
  const o = v as Record<string, unknown>
  const inner = o.$date as Record<string, unknown> | undefined
  const ms = inner ? num(inner) : num(v)
  return ms != null ? new Date(ms) : null
}

export async function sgFetch<T = unknown>(path: string): Promise<T> {
  const key = process.env.RAPIDAPI_KEY
  if (!key) throw new Error('RAPIDAPI_KEY not configured')
  const res = await fetch(`https://${HOST}/${path}`, {
    headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': HOST },
  })
  if (!res.ok) {
    throw new Error(`SlashGolf ${path.split('?')[0]} returned ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ---- Typed slices of the responses we consume (fields verified against
// live responses on 2026-07-23; see scratchpad probes) ----

export interface SgScheduleEvent {
  tournId: string
  name: string
  date: { start: unknown; end: unknown; weekNumber: string }
  purse?: unknown
}

export interface SgLeaderboardRow {
  playerId: string
  firstName: string
  lastName: string
  status: 'complete' | 'cut' | 'wd' | string
  total: string
  position: string // "1" | "T4" | "CUT"
  rounds: Array<{ roundId: unknown; strokes: unknown; scoreToPar: string }>
}

export interface SgLeaderboard {
  status: string // "Not Started" | ... | "Official"
  roundId: unknown
  roundStatus: string
  cutLines: Array<{ cutCount: unknown; cutScore: string }>
  leaderboardRows: SgLeaderboardRow[]
}

export interface SgScorecardRound {
  roundId: unknown
  holes: Record<string, { holeScore: unknown; par: unknown }>
}

export interface SgRankingRow {
  playerId: string
  fullName: string
  rank: unknown
}

export interface SgRankings {
  name: string
  rankings: SgRankingRow[]
}

export interface SgTournamentInfo {
  tournId: string
  name: string
  status: string
  timeZone: string
  courses: Array<{ courseId: string; courseName: string; host?: string }>
}

// Derive stat counts from hole-by-hole scorecard rounds.
export function statsFromScorecards(rounds: SgScorecardRound[]): {
  holeInOnes: number
  albatrosses: number
  eagles: number
  birdies: number
  pars: number
  bogeys: number
  doubleBogeys: number
  worseThanDouble: number
  roundStrokes: Map<number, number>
} {
  const out = {
    holeInOnes: 0,
    albatrosses: 0,
    eagles: 0,
    birdies: 0,
    pars: 0,
    bogeys: 0,
    doubleBogeys: 0,
    worseThanDouble: 0,
    roundStrokes: new Map<number, number>(),
  }
  for (const r of rounds) {
    const roundNum = num(r.roundId)
    let strokes = 0
    for (const h of Object.values(r.holes ?? {})) {
      const score = num(h.holeScore)
      const par = num(h.par)
      if (score == null || par == null) continue
      strokes += score
      if (score === 1) {
        // An ace scores as hole-in-one only — never also as eagle/albatross,
        // which would double-pay it in the points engine.
        out.holeInOnes++
        continue
      }
      const diff = score - par
      if (diff <= -3) out.albatrosses++
      else if (diff === -2) out.eagles++
      else if (diff === -1) out.birdies++
      else if (diff === 0) out.pars++
      else if (diff === 1) out.bogeys++
      else if (diff === 2) out.doubleBogeys++
      else out.worseThanDouble++
    }
    if (roundNum != null && strokes > 0) out.roundStrokes.set(roundNum, strokes)
  }
  return out
}

// "T4" -> 4, "1" -> 1, "CUT"/"" -> null
export function parsePosition(pos: string | undefined): number | null {
  if (!pos) return null
  const m = pos.match(/^T?(\d+)$/)
  return m ? Number(m[1]) : null
}
