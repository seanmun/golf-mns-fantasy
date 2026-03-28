import { useQuery } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { Copy, Users, ChevronRight } from 'lucide-react'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { toast } from 'sonner'

export function PoolDetail() {
  const { poolId } = useParams<{ poolId: string }>()
  const { user } = useUser()

  const { data, isLoading } = useQuery({
    queryKey: ['pool', poolId],
    queryFn: async () => {
      const headers: Record<string, string> = {}
      const res = await fetch(`/api/pools/${poolId}`, { headers })
      if (!res.ok) throw new Error('Pool not found')
      return res.json()
    },
  })

  if (isLoading) return <LoadingSpinner />
  if (!data) return null

  const { pool, entryCount, userEntry } = data
  const isLocked = pool.status === 'locked' || pool.status === 'active' || new Date() >= new Date(pool.tournamentLockTime)
  const hasPicks = userEntry && (userEntry.golferIds as string[]).length > 0
  const isOwner = user?.id === pool.createdBy

  function copyJoinCode() {
    navigator.clipboard.writeText(pool.joinCode)
    toast.success('Join code copied!')
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-4xl mb-1" style={{ color: 'var(--color-text-primary)' }}>
              {pool.name}
            </h1>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {pool.tournamentName} · {pool.tournamentCourse}
            </p>
          </div>
          <span
            className="px-2.5 py-1 rounded-full text-xs border mt-1"
            style={{
              borderColor: isLocked ? 'var(--color-border)' : 'var(--color-green-muted)',
              color: isLocked ? 'var(--color-text-muted)' : 'var(--color-green-primary)',
            }}
          >
            {isLocked ? 'LOCKED' : 'OPEN'}
          </span>
        </div>

        {pool.description && (
          <p className="mt-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{pool.description}</p>
        )}

        <div className="flex items-center gap-4 mt-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          <span className="flex items-center gap-1">
            <Users size={13} />
            {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
          </span>
          <span>Pick {pool.rosterSize} golfers</span>
          {!isLocked && (
            <span style={{ color: 'var(--color-score-bogey)' }}>
              Locks {new Date(pool.tournamentLockTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
        </div>

        {/* Join code */}
        {isOwner && pool.joinCode && (
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg border"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Join code:</span>
            <span className="font-mono font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>{pool.joinCode}</span>
            <button onClick={copyJoinCode} className="ml-1 hover:opacity-70 transition-opacity">
              <Copy size={13} style={{ color: 'var(--color-text-muted)' }} />
            </button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-10">
        {!isLocked && (
          <Link
            to={`/pools/${poolId}/pick`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm"
            style={{ background: 'var(--color-green-primary)', color: '#000' }}
          >
            {hasPicks ? 'Edit Picks' : 'Make Picks'}
            <ChevronRight size={14} />
          </Link>
        )}
        <Link
          to={`/pools/${poolId}/leaderboard`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm border"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          Leaderboard
        </Link>
      </div>

      {/* My picks preview */}
      {hasPicks && (
        <div className="rounded-xl border p-5" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <h3 className="font-display text-lg mb-3" style={{ color: 'var(--color-text-primary)' }}>YOUR PICKS</h3>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {(userEntry.golferIds as string[]).length} golfers selected ·{' '}
            <span className="font-mono" style={{ color: 'var(--color-green-primary)' }}>
              {userEntry.totalPoints} pts
            </span>
          </p>
        </div>
      )}
    </div>
  )
}
