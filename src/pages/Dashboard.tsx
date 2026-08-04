import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useApi } from '@/lib/api/client'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { EmptyState } from '@/components/shared/EmptyState'

export function Dashboard() {
  const { apiFetch } = useApi()

  const { data, isLoading } = useQuery({
    queryKey: ['my-pools'],
    queryFn: () => apiFetch<{ pools: any[] }>('/api/pools/mine'),
  })

  if (isLoading) return <LoadingSpinner />

  const pools = data?.pools || []

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-4xl" style={{ color: 'var(--color-text-primary)' }}>MY POOLS</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            Your active pools
          </p>
        </div>
        <Link
          to="/pools/create"
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: 'var(--color-green-primary)', color: '#000' }}
        >
          Create Pool
        </Link>
      </div>

      {pools.length === 0 ? (
        <EmptyState
          title="No pools yet"
          description="Join an existing pool or create your own for any PGA Tour event."
          action={
            <Link
              to="/pools"
              className="px-5 py-2.5 rounded-lg text-sm font-medium"
              style={{ background: 'var(--color-green-primary)', color: '#000' }}
            >
              Browse Pools
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4">
          {pools.map((pool: any) => {
            // Once an event is under way (or done) the standings are what
            // people want; before that, the pool page with its pick flow.
            const started =
              pool.tournamentStatus === 'active' ||
              pool.tournamentStatus === 'completed' ||
              (pool.tournamentStartDate &&
                new Date(pool.tournamentStartDate).getTime() <= Date.now())
            return (
            <Link
              key={pool.id}
              to={started ? `/pools/${pool.id}/leaderboard` : `/pools/${pool.id}`}
              className="block p-5 rounded-xl border transition-all"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{pool.name}</h3>
                  <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                    {pool.tournamentName}
                    {pool.tournamentStartDate && (
                      <span style={{ color: 'var(--color-text-muted)' }}>
                        {' · '}
                        {new Date(pool.tournamentStartDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-lg" style={{ color: 'var(--color-green-primary)' }}>
                    {pool.totalPoints ?? '-'} pts
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    Rank #{pool.rank ?? '-'}
                  </div>
                </div>
              </div>
            </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
