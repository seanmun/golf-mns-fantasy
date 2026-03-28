import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Users, Globe } from 'lucide-react'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { EmptyState } from '@/components/shared/EmptyState'

export function PoolBrowse() {
  const [joinCode, setJoinCode] = useState('')
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['pools'],
    queryFn: async () => {
      const res = await fetch('/api/pools')
      if (!res.ok) throw new Error('Failed to load pools')
      return res.json()
    },
  })

  if (isLoading) return <LoadingSpinner />

  const pools = data?.pools || []

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-4xl" style={{ color: 'var(--color-text-primary)' }}>POOLS</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            Open pools for the Masters 2026
          </p>
        </div>
        <Link
          to="/pools/create"
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--color-green-primary)', color: '#000' }}
        >
          Create Pool
        </Link>
      </div>

      {/* Join by code */}
      <div className="flex gap-2 mb-8">
        <input
          type="text"
          placeholder="Enter join code..."
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === 'Enter' && joinCode.trim()) navigate(`/pools/join/${joinCode.trim()}`) }}
          className="flex-1 px-3 py-2.5 rounded-lg border text-sm outline-none"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
        />
        <button
          onClick={() => { if (joinCode.trim()) navigate(`/pools/join/${joinCode.trim()}`) }}
          disabled={!joinCode.trim()}
          className="px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
          style={{ background: 'var(--color-surface)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}
        >
          Join
        </button>
      </div>

      {pools.length === 0 ? (
        <EmptyState
          title="No pools yet"
          description="Be the first to create a pool for the Masters."
          action={
            <Link to="/pools/create" className="px-5 py-2.5 rounded-lg text-sm font-medium"
              style={{ background: 'var(--color-green-primary)', color: '#000' }}>
              Create Pool
            </Link>
          }
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {pools.map((pool: any) => (
            <Link
              key={pool.id}
              to={`/pools/${pool.id}`}
              className="block p-5 rounded-xl border transition-all duration-200 group"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold group-hover:text-white transition-colors"
                  style={{ color: 'var(--color-text-primary)' }}>
                  {pool.name}
                </h3>
                <Globe size={14} style={{ color: 'var(--color-text-muted)' }} />
              </div>
              <p className="text-xs mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                {pool.tournamentName} · {pool.tournamentCourse}
              </p>
              <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                <span className="flex items-center gap-1">
                  <Users size={11} />
                  {pool.entryCount} {pool.entryCount === 1 ? 'entry' : 'entries'}
                </span>
                <span>Pick {pool.rosterSize} golfers</span>
                <span
                  className="ml-auto px-2 py-0.5 rounded-full text-xs"
                  style={{
                    background: pool.status === 'open' ? 'var(--color-green-dim)' : 'transparent',
                    color: pool.status === 'open' ? 'var(--color-green-primary)' : 'var(--color-text-muted)',
                    border: '1px solid',
                    borderColor: pool.status === 'open' ? 'var(--color-green-muted)' : 'var(--color-border)',
                  }}
                >
                  {pool.status.toUpperCase()}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
