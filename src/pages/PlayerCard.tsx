import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ArrowLeft } from 'lucide-react'

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

  // Aggregate stats across all results
  const totalBirdies = results.reduce((s: number, r: TournamentResult) => s + r.birdies, 0)
  const totalEagles = results.reduce((s: number, r: TournamentResult) => s + r.eagles, 0)
  const totalEarnings = results.reduce((s: number, r: TournamentResult) => s + (r.earnings || 0), 0)
  const cutsMade = results.filter((r: TournamentResult) => r.madeCut).length
  const topTens = results.filter((r: TournamentResult) => r.rank && r.rank <= 10).length
  const wins = results.filter((r: TournamentResult) => r.rank === 1).length

  // Score trend for chart
  const scores = results
    .filter((r: TournamentResult) => r.totalScore != null)
    .map((r: TournamentResult) => r.totalScore as number)

  const minScore = scores.length > 0 ? Math.min(...scores) : -20
  const maxScore = scores.length > 0 ? Math.max(...scores) : 20
  const range = Math.max(Math.abs(maxScore - minScore), 1)

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
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-8">
          {[
            { label: 'Events', value: results.length, color: 'var(--color-text-primary)' },
            { label: 'Wins', value: wins, color: 'var(--color-gold)' },
            { label: 'Top 10s', value: topTens, color: 'var(--color-green-primary)' },
            { label: 'Cuts Made', value: `${cutsMade}/${results.length}`, color: 'var(--color-text-primary)' },
            { label: 'Birdies', value: totalBirdies, color: 'var(--color-score-birdie)' },
            { label: 'Eagles', value: totalEagles, color: 'var(--color-score-eagle)' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border p-3 text-center" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
              <p className="font-mono font-bold text-2xl" style={{ color }}>{value}</p>
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

      {/* Score trend chart */}
      {scores.length > 1 && (
        <div className="rounded-xl border p-5 mb-8" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <h2 className="font-display text-lg mb-4" style={{ color: 'var(--color-text-primary)' }}>SCORE TREND</h2>
          <div className="flex items-end gap-1 h-32">
            {results.filter((r: TournamentResult) => r.totalScore != null).map((r: TournamentResult, i: number) => {
              const score = r.totalScore as number
              // Invert: lower score = taller bar (better)
              const normalized = 1 - (score - minScore) / range
              const height = Math.max(normalized * 100, 8)
              const isNegative = score < 0
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[9px] font-mono" style={{ color: isNegative ? 'var(--color-green-primary)' : score > 0 ? 'var(--color-score-bogey)' : 'var(--color-text-muted)' }}>
                    {score > 0 ? `+${score}` : score}
                  </span>
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: `${height}%`,
                      background: isNegative
                        ? 'var(--color-green-primary)'
                        : score > 0
                        ? 'var(--color-score-bogey)'
                        : 'var(--color-border)',
                      opacity: 0.7,
                    }}
                  />
                  <span className="text-[8px] truncate w-full text-center" style={{ color: 'var(--color-text-muted)' }}>
                    {r.tournamentName.length > 12 ? r.tournamentName.slice(0, 12) + '...' : r.tournamentName}
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
                  <th className="text-center px-2 py-2 text-xs font-normal hidden sm:table-cell" style={{ color: 'var(--color-text-muted)' }}>
                    <span title="Birdies">BIR</span>
                  </th>
                  <th className="text-center px-2 py-2 text-xs font-normal hidden sm:table-cell" style={{ color: 'var(--color-text-muted)' }}>
                    <span title="Eagles">EAG</span>
                  </th>
                  <th className="text-center px-2 py-2 text-xs font-normal hidden sm:table-cell" style={{ color: 'var(--color-text-muted)' }}>
                    <span title="Bogeys">BOG</span>
                  </th>
                  <th className="text-right px-5 py-2 text-xs font-normal hidden sm:table-cell" style={{ color: 'var(--color-text-muted)' }}>Earnings</th>
                </tr>
              </thead>
              <tbody>
                {[...results].reverse().map((r: TournamentResult, i: number) => {
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
                        {r.totalScore != null ? (r.totalScore > 0 ? `+${r.totalScore}` : r.totalScore) : '-'}
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
