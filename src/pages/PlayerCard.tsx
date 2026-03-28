import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ArrowLeft } from 'lucide-react'

const DEFAULT_SCORING = {
  hole_in_one: 15,
  albatross: 12,
  eagle: 8,
  birdie: 3,
  par: 0,
  bogey: -1,
  double_bogey: -3,
  worse_than_double: -5,
  made_cut_bonus: 2,
  position_bonuses: { '1': 20, '2': 12, '3': 8, '4': 5, '5': 3 } as Record<string, number>,
}

interface TournamentResult {
  tournamentName: string
  tournamentDate: string
  rank: number | null
  totalScore: number | null
  earnings: number | null
  birdies: number
  eagles: number
  pars: number
  bogeys: number
  doubleBogeys: number
  holeInOnes: number
  madeCut: boolean
  rounds: number
}

function calcFantasyPts(r: TournamentResult): number {
  let pts = 0
  pts += r.holeInOnes * DEFAULT_SCORING.hole_in_one
  pts += r.eagles * DEFAULT_SCORING.eagle
  pts += r.birdies * DEFAULT_SCORING.birdie
  pts += r.pars * DEFAULT_SCORING.par
  pts += r.bogeys * DEFAULT_SCORING.bogey
  pts += r.doubleBogeys * DEFAULT_SCORING.double_bogey
  if (r.madeCut) pts += DEFAULT_SCORING.made_cut_bonus
  if (r.rank) {
    const posBonus = DEFAULT_SCORING.position_bonuses[String(r.rank)]
    if (posBonus) pts += posBonus
  }
  return pts
}

export function PlayerCard() {
  const { id } = useParams<{ id: string }>()

  const { data, isLoading, error } = useQuery({
    queryKey: ['golfer', id],
    queryFn: async () => {
      const res = await fetch(`/api/golfers/${id}`)
      if (!res.ok) throw new Error('Failed to load golfer')
      return res.json()
    },
  })

  if (isLoading) return <LoadingSpinner />
  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <p style={{ color: 'var(--color-text-muted)' }}>Golfer not found.</p>
        <Link to="/players" className="text-sm text-neon-green mt-4 inline-block">Back to Players</Link>
      </div>
    )
  }

  const { golfer, results } = data as { golfer: any; results: TournamentResult[] }

  // Calculate fantasy points per tournament
  const resultsWithPts = results.map((r: TournamentResult) => ({
    ...r,
    fantasyPts: calcFantasyPts(r),
  }))

  // Aggregate stats
  const totalBirdies = results.reduce((s: number, r: TournamentResult) => s + r.birdies, 0)
  const totalEagles = results.reduce((s: number, r: TournamentResult) => s + r.eagles, 0)
  const totalEarnings = results.reduce((s: number, r: TournamentResult) => s + (r.earnings || 0), 0)
  const totalFantasyPts = resultsWithPts.reduce((s, r) => s + r.fantasyPts, 0)
  const cutsMade = results.filter((r: TournamentResult) => r.madeCut).length
  const topTens = results.filter((r: TournamentResult) => r.rank && r.rank <= 10).length
  const wins = results.filter((r: TournamentResult) => r.rank === 1).length
  const avgFantasyPts = results.length > 0 ? Math.round(totalFantasyPts / results.length) : 0

  // Fantasy points for chart
  const fantasyScores = resultsWithPts.map((r) => r.fantasyPts)
  const absMax = fantasyScores.length > 0 ? Math.max(...fantasyScores.map(Math.abs), 1) : 20

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* Back link */}
      <Link to="/players" className="inline-flex items-center gap-1.5 text-sm mb-6 hover:text-neon-green transition-colors" style={{ color: 'var(--color-text-muted)' }}>
        <ArrowLeft size={14} /> Back to Players
      </Link>

      {/* Profile header */}
      <div className="flex items-center gap-5 mb-8">
        {golfer.photoUrl && (
          <img
            src={golfer.photoUrl}
            alt={golfer.name}
            className="w-20 h-20 rounded-full object-cover border-2"
            style={{ borderColor: 'var(--color-border)' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        )}
        <div>
          <h1 className="font-display text-4xl" style={{ color: 'var(--color-text-primary)' }}>{golfer.name}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {golfer.country && <span>{golfer.country}</span>}
            {golfer.worldRanking && (
              <span className="font-mono font-bold" style={{ color: 'var(--color-green-primary)' }}>
                #{golfer.worldRanking} World Ranking
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Season stats */}
      {results.length > 0 && (
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-3 mb-8">
          {[
            { label: 'Events', value: results.length, color: 'var(--color-text-primary)' },
            { label: 'Wins', value: wins, color: 'var(--color-gold)' },
            { label: 'Top 10s', value: topTens, color: 'var(--color-green-primary)' },
            { label: 'Cuts', value: `${cutsMade}/${results.length}`, color: 'var(--color-text-primary)' },
            { label: 'Birdies', value: totalBirdies, color: 'var(--color-score-birdie)' },
            { label: 'Eagles', value: totalEagles, color: 'var(--color-score-eagle)' },
            { label: 'FPts', value: totalFantasyPts, color: 'var(--color-green-primary)' },
            { label: 'Avg FPts', value: avgFantasyPts, color: 'var(--color-green-primary)' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border p-3 text-center" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
              <p className="font-mono font-bold text-xl" style={{ color }}>{value}</p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Earnings */}
      {totalEarnings > 0 && (
        <div className="rounded-xl border p-4 mb-8 text-center" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Season Earnings</p>
          <p className="font-mono font-bold text-3xl mt-1" style={{ color: 'var(--color-gold)' }}>
            ${totalEarnings.toLocaleString()}
          </p>
        </div>
      )}

      {/* Fantasy points trend chart */}
      {fantasyScores.length > 1 && (
        <div className="rounded-xl border p-5 mb-8" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <h2 className="font-display text-lg mb-1" style={{ color: 'var(--color-text-primary)' }}>FANTASY POINTS TREND</h2>
          <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>Points per tournament using default scoring</p>
          <div className="flex items-end gap-2 h-40">
            {resultsWithPts.map((r, i) => {
              const pts = r.fantasyPts
              const height = Math.max((Math.abs(pts) / absMax) * 100, 12)
              const isPositive = pts >= 0
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] font-mono font-bold" style={{ color: isPositive ? 'var(--color-green-primary)' : 'var(--color-score-bogey)' }}>
                    {pts > 0 ? `+${pts}` : pts}
                  </span>
                  <div
                    className="w-full rounded-t min-h-[8px]"
                    style={{
                      height: `${height}%`,
                      background: isPositive ? 'var(--color-green-primary)' : 'var(--color-score-bogey)',
                      opacity: 0.8,
                    }}
                  />
                  <span className="text-[8px] truncate w-full text-center leading-tight" style={{ color: 'var(--color-text-muted)' }}>
                    {r.tournamentName.length > 14 ? r.tournamentName.slice(0, 14) + '…' : r.tournamentName}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent tournament results */}
      {results.length > 0 ? (
        <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <h2 className="font-display text-lg p-5 pb-3" style={{ color: 'var(--color-text-primary)' }}>RECENT RESULTS</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th className="text-left px-5 py-2 text-xs font-normal" style={{ color: 'var(--color-text-muted)' }}>Tournament</th>
                  <th className="text-center px-2 py-2 text-xs font-normal" style={{ color: 'var(--color-text-muted)' }}>Pos</th>
                  <th className="text-center px-2 py-2 text-xs font-normal" style={{ color: 'var(--color-text-muted)' }}>Score</th>
                  <th className="text-center px-2 py-2 text-xs font-normal" style={{ color: 'var(--color-text-muted)' }}>FPts</th>
                  <th className="text-center px-2 py-2 text-xs font-normal hidden sm:table-cell" style={{ color: 'var(--color-text-muted)' }}>BIR</th>
                  <th className="text-center px-2 py-2 text-xs font-normal hidden sm:table-cell" style={{ color: 'var(--color-text-muted)' }}>EAG</th>
                  <th className="text-center px-2 py-2 text-xs font-normal hidden sm:table-cell" style={{ color: 'var(--color-text-muted)' }}>BOG</th>
                  <th className="text-right px-5 py-2 text-xs font-normal hidden sm:table-cell" style={{ color: 'var(--color-text-muted)' }}>Earnings</th>
                </tr>
              </thead>
              <tbody>
                {[...resultsWithPts].reverse().map((r, i) => {
                  const scoreColor = r.totalScore != null && r.totalScore < 0
                    ? 'var(--color-green-primary)'
                    : r.totalScore != null && r.totalScore > 0
                    ? 'var(--color-score-bogey)'
                    : 'var(--color-text-primary)'

                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td className="px-5 py-3">
                        <div style={{ color: 'var(--color-text-primary)' }}>{r.tournamentName}</div>
                        <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {new Date(r.tournamentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {!r.madeCut && <span className="ml-2" style={{ color: 'var(--color-score-bogey)' }}>MC</span>}
                        </div>
                      </td>
                      <td className="text-center px-2 py-3 font-mono font-bold" style={{ color: r.rank && r.rank <= 10 ? 'var(--color-green-primary)' : 'var(--color-text-primary)' }}>
                        {r.rank ? `T${r.rank}` : '-'}
                      </td>
                      <td className="text-center px-2 py-3 font-mono font-bold" style={{ color: scoreColor }}>
                        {r.totalScore != null ? (r.totalScore > 0 ? `+${r.totalScore}` : r.totalScore === 0 ? 'E' : r.totalScore) : '-'}
                      </td>
                      <td className="text-center px-2 py-3 font-mono font-bold" style={{ color: r.fantasyPts >= 0 ? 'var(--color-green-primary)' : 'var(--color-score-bogey)' }}>
                        {r.fantasyPts > 0 ? `+${r.fantasyPts}` : r.fantasyPts}
                      </td>
                      <td className="text-center px-2 py-3 font-mono hidden sm:table-cell" style={{ color: 'var(--color-score-birdie)' }}>{r.birdies}</td>
                      <td className="text-center px-2 py-3 font-mono hidden sm:table-cell" style={{ color: 'var(--color-score-eagle)' }}>{r.eagles}</td>
                      <td className="text-center px-2 py-3 font-mono hidden sm:table-cell" style={{ color: 'var(--color-score-bogey)' }}>{r.bogeys}</td>
                      <td className="text-right px-5 py-3 font-mono hidden sm:table-cell" style={{ color: 'var(--color-text-secondary)' }}>
                        {r.earnings ? `$${r.earnings.toLocaleString()}` : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <p style={{ color: 'var(--color-text-muted)' }}>No recent tournament results available.</p>
        </div>
      )}
    </div>
  )
}
