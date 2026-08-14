export interface ScoringConfig {
  hole_in_one: number
  albatross: number
  eagle: number
  birdie: number
  par: number
  bogey: number
  double_bogey: number
  worse_than_double: number
  made_cut_bonus: number
  position_bonuses: Record<string, number>
}

// Placement pays down to 30th. Ties take the FULL value, not a split —
// parsePosition maps "T3" to 3, so a five-way T3 is +15 each.
export const DEFAULT_POSITION_BONUSES: Record<string, number> = {
  '1': 30, '2': 20, '3': 15, '4': 12, '5': 10,
  '6': 9, '7': 8, '8': 7, '9': 6, '10': 5,
  '11': 3, '12': 3, '13': 3, '14': 3, '15': 3,
  '16': 2, '17': 2, '18': 2, '19': 2, '20': 2,
  '21': 1, '22': 1, '23': 1, '24': 1, '25': 1,
  '26': 1, '27': 1, '28': 1, '29': 1, '30': 1,
}

export const DEFAULT_SCORING: ScoringConfig = {
  hole_in_one: 15,
  albatross: 12,
  eagle: 8,
  birdie: 3,
  par: 0,
  bogey: -1,
  double_bogey: -3,
  worse_than_double: -5,
  made_cut_bonus: 2,
  position_bonuses: DEFAULT_POSITION_BONUSES,
}

export interface GolferStats {
  hole_in_ones: number
  albatrosses: number
  eagles: number
  birdies: number
  pars: number
  bogeys: number
  double_bogeys: number
  worse_than_double: number
  is_cut: boolean
  is_withdrawn: boolean
  // Whether this tournament's cut has actually happened. Without it the
  // "made cut" bonus paid every golfer from round 1 and clawed it back
  // on Friday, paid withdrawals, and paid out in full at no-cut events
  // like the playoffs — where nobody can make a cut because there isn't
  // one. See cutApplied on golf.tournaments.
  cut_applied: boolean
  // Whether the event is over. position is stored on every sync, so
  // mid-round it holds a LIVE standing: a player three holes into
  // Thursday can sit in first and collect the winner's bonus, then lose
  // it an hour later. A finish bonus is a result, not a standing — it
  // pays only once the event is final.
  event_final: boolean
  position: number | null
}

export function calculateGolferPoints(stats: GolferStats, config: ScoringConfig): number {
  let points = 0

  points += stats.hole_in_ones * config.hole_in_one
  points += stats.albatrosses * config.albatross
  points += stats.eagles * config.eagle
  points += stats.birdies * config.birdie
  points += stats.pars * config.par
  points += stats.bogeys * config.bogey
  points += stats.double_bogeys * config.double_bogey
  points += stats.worse_than_double * config.worse_than_double

  // Only once there IS a cut, and only for someone who survived it.
  if (stats.cut_applied && !stats.is_cut && !stats.is_withdrawn) {
    points += config.made_cut_bonus
  }

  if (stats.event_final && stats.position !== null) {
    const posBonus = config.position_bonuses[String(stats.position)]
    if (posBonus) points += posBonus
  }

  return Math.round(points * 100) / 100
}

export function calculateEntryPoints(golferStatsList: GolferStats[], config: ScoringConfig): number {
  return golferStatsList.reduce((total, stats) => total + calculateGolferPoints(stats, config), 0)
}

// Hole-scoring points for one round from stored hole data. Excludes
// tournament-level bonuses (made-cut, position) by design — those only
// exist at tournament scope, so per-round columns sum to total minus
// bonuses. An ace counts as hole-in-one only (mirrors statsFromScorecards).
export function pointsFromHoles(
  holes: Array<{ score: number; par: number }>,
  config: ScoringConfig
): number {
  let pts = 0
  for (const h of holes) {
    if (h.score === 1) {
      pts += config.hole_in_one
      continue
    }
    const diff = h.score - h.par
    if (diff <= -3) pts += config.albatross
    else if (diff === -2) pts += config.eagle
    else if (diff === -1) pts += config.birdie
    else if (diff === 0) pts += config.par
    else if (diff === 1) pts += config.bogey
    else if (diff === 2) pts += config.double_bogey
    else pts += config.worse_than_double
  }
  return Math.round(pts * 100) / 100
}
