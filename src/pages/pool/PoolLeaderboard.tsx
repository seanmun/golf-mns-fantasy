import { useQuery } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ScoreBadge } from '@/components/shared/ScoreBadge'
import { ChevronLeft } from 'lucide-react'
import {
  calculateGolferPoints,
  DEFAULT_SCORING,
  type ScoringConfig,
} from '@/lib/scoring/engine'

function golferPoints(results: any, config: ScoringConfig): number {
  return calculateGolferPoints(
    {
      hole_in_ones: results.holeInOnes,
      albatrosses: results.albatrosses,
      eagles: results.eagles,
      birdies: results.birdies,
      pars: results.pars,
      bogeys: results.bogeys,
      double_bogeys: results.doubleBogeys,
      worse_than_double: results.worseThanDouble,
      is_cut: results.isCut,
      position: results.position,
    },
    config
  )
}

export function PoolLeaderboard() {
  const { poolId } = useParams<{ poolId: string }>()
  const { user } = useUser()

  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard', poolId],
    queryFn: async () => {
      const res = await fetch(`/api/pools/leaderboard?poolId=${poolId}`)
      if (!res.ok) throw new Error('Failed to load leaderboard')
      const json = await res.json()
      // Fire-and-forget: nudge the live score sync. Server-side throttle
      // means this only hits sportsdata every few minutes no matter how
      // many viewers are on the page.
      if (json?.pool?.tournamentId) {
        void fetch('/api/scoring/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tournamentId: json.pool.tournamentId }),
        }).catch(() => {})
      }
      return json
    },
    refetchInterval: 60_000, // refresh every minute during active tournament
  })

  if (isLoading) return <LoadingSpinner />

  const { leaderboard = [], pool } = data || {}

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-8">
        <Link to={`/pools/${poolId}`} className="inline-flex items-center gap-1 text-sm mb-4"
          style={{ color: 'var(--color-text-muted)' }}>
          <ChevronLeft size={14} /> Back to pool
        </Link>
        <h1 className="font-display text-4xl" style={{ color: 'var(--color-text-primary)' }}>
          LEADERBOARD
        </h1>
        {pool && (
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            {pool.name} · {leaderboard.length} entries
          </p>
        )}
      </div>

      {leaderboard.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No entries yet.</p>
      ) : (
        <div className="space-y-2">
          {leaderboard.map((entry: any, idx: number) => {
            const isMe = user?.id === entry.userId
            return (
              <div
                key={entry.id}
                className="rounded-xl border p-4"
                style={{
                  background: isMe ? 'var(--color-green-dim)' : 'var(--color-surface)',
                  borderColor: isMe ? 'var(--color-green-muted)' : 'var(--color-border)',
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-lg font-bold w-8 text-center"
                      style={{ color: idx === 0 ? 'var(--color-gold)' : 'var(--color-text-muted)' }}>
                      #{entry.rank || idx + 1}
                    </span>
                    <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      {entry.displayName} {isMe && <span className="text-xs" style={{ color: 'var(--color-green-primary)' }}>(you)</span>}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-lg" style={{ color: 'var(--color-green-primary)' }}>
                    {Number(entry.totalPoints).toFixed(0)} pts
                  </span>
                </div>

                {/* Golfer breakdown */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {entry.golfers.map(({ golfer, results }: any) => (
                    <div key={golfer?.id || Math.random()} className="flex items-center justify-between px-3 py-2 rounded-lg"
                      style={{ background: 'var(--color-surface-2)' }}>
                      <span className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
                        {golfer?.name || 'Unknown'}
                      </span>
                      {results ? (
                        <ScoreBadge score={golferPoints(results, pool?.scoringConfig ?? DEFAULT_SCORING)} />
                      ) : (
                        <span className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>-</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
