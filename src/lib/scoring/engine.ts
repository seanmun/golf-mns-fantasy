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
  position_bonuses: { '1': 20, '2': 12, '3': 8, '4': 5, '5': 3 },
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

  if (!stats.is_cut) {
    points += config.made_cut_bonus
  }

  if (stats.position !== null) {
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
