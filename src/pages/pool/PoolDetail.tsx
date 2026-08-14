import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, Link, useLocation } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { Copy, Users, ChevronRight, Share2, CheckCircle, Circle, Settings } from 'lucide-react'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { useApi } from '@/lib/api/client'
import { toast } from 'sonner'

export function PoolDetail() {
  const { poolId } = useParams<{ poolId: string }>()
  const { user, isSignedIn } = useUser()
  const { apiFetch } = useApi()
  const location = useLocation()
  const qc = useQueryClient()
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['pool', poolId],
    queryFn: async () => {
      return apiFetch(`/api/pools/${poolId}`) as Promise<{
        pool: any
        tournaments: any[]
        entryCount: number
        userEntry: any
      }>
    },
  })

  if (isLoading) return <LoadingSpinner />
  if (!data) return null

  const { pool, tournaments = [], entryCount, userEntry } = data
  // A multi-week pool scores several events; pool.tournament* still
  // describes the first, which is the one that locks it.
  const isMulti = tournaments.length > 1
  const isLocked = pool.status === 'locked' || pool.status === 'active' || new Date() >= new Date(pool.tournamentLockTime)
  const hasPicks = userEntry && (userEntry.golferIds as string[]).length > 0
  const isOwner = user?.id === pool.createdBy
  const isMember = !!userEntry
  const isFull = pool.maxEntries != null && entryCount >= pool.maxEntries
  // Why a visitor can't join, in the same order the server rejects them.
  const blockedReason =
    pool.status === 'cancelled'
      ? 'This pool was cancelled.'
      : pool.status === 'completed'
        ? 'This pool is finished.'
        : isLocked
          ? 'This event has already started.'
          : isFull
            ? 'This pool is full.'
            : null

  async function join() {
    setJoining(true)
    setJoinError(null)
    try {
      await apiFetch('/api/pools/join', {
        method: 'POST',
        body: JSON.stringify({ poolId }),
      })
      toast.success("You're in")
      // Re-read rather than navigate: the page becomes the member view.
      await qc.invalidateQueries({ queryKey: ['pool', poolId] })
      await qc.invalidateQueries({ queryKey: ['pool-members', poolId] })
    } catch (err: any) {
      setJoinError(err.message || 'Could not join this pool')
    } finally {
      setJoining(false)
    }
  }

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
              {isMulti
                ? `${tournaments.length} events · ${pool.tournamentName} +${tournaments.length - 1} more`
                : `${pool.tournamentName} · ${pool.tournamentCourse}`}
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

        {/* The whole slate, in play order. One draft before event 1, and
            the roster rides all of them. */}
        {isMulti && (
          <div className="mt-4 rounded-lg border divide-y" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
            {tournaments.map((t: any, i: number) => (
              <div
                key={t.id}
                className="flex items-center justify-between px-4 py-2.5"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>{i + 1}</span>
                  <div className="min-w-0">
                    <div className="text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{t.name}</div>
                    <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                      {t.course} ·{' '}
                      {new Date(t.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      –{new Date(t.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                </div>
                <span
                  className="text-xs shrink-0 ml-3"
                  style={{
                    color:
                      t.status === 'active'
                        ? 'var(--color-green-primary)'
                        : 'var(--color-text-muted)',
                  }}
                >
                  {t.status === 'completed' ? 'Final' : t.status === 'active' ? 'Live' : 'Upcoming'}
                </span>
              </div>
            ))}
          </div>
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

        {/* Join code + share link */}
        {pool.joinCode && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Join code:</span>
              <span className="font-mono font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>{pool.joinCode}</span>
              <button onClick={copyJoinCode} className="ml-1 hover:opacity-70 transition-opacity">
                <Copy size={13} style={{ color: 'var(--color-text-muted)' }} />
              </button>
            </div>
            <button
              onClick={() => {
                const url = `${window.location.origin}/pools/join/${pool.joinCode}`
                navigator.clipboard.writeText(url)
                toast.success('Share link copied!')
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm hover:opacity-80 transition-opacity"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              <Share2 size={13} /> Share Link
            </button>
          </div>
        )}
      </div>

      {/* Join — for anyone who isn't in the pool yet, this is the whole
          point of the page. Without it a public pool is a dead end. */}
      {!isMember && (
        <div
          className="rounded-xl border p-5 mb-8"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        >
          {blockedReason ? (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{blockedReason}</p>
          ) : isSignedIn ? (
            <>
              <button
                onClick={join}
                disabled={joining}
                className="px-6 py-3 rounded-lg font-medium text-sm disabled:opacity-50"
                style={{ background: 'var(--color-green-primary)', color: '#000' }}
              >
                {joining ? 'Joining…' : 'Join Pool'}
              </button>
              <p className="text-xs mt-3" style={{ color: 'var(--color-text-muted)' }}>
                Pick {pool.rosterSize} golfers · {pool.pickMode === 'draft' ? 'Snake draft' : "Pick'em"}
              </p>
              {joinError && (
                <p className="text-sm mt-3" style={{ color: 'var(--color-score-bogey)' }}>{joinError}</p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                Sign in to join this pool.
              </p>
              <Link
                to={`/sign-in?redirect_url=${encodeURIComponent(location.pathname)}`}
                className="inline-block px-6 py-3 rounded-lg font-medium text-sm"
                style={{ background: 'var(--color-green-primary)', color: '#000' }}
              >
                Sign in to join
              </Link>
            </>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-10">
        {isMember &&
          (pool.pickMode === 'draft' ? (
            <Link
              to={`/pools/${poolId}/draft`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm"
              style={{ background: 'var(--color-green-primary)', color: '#000' }}
            >
              {pool.draftId ? 'Draft Room' : 'Set Up Draft'}
              <ChevronRight size={14} />
            </Link>
          ) : (
            !isLocked && (
              <Link
                to={`/pools/${poolId}/pick`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm"
                style={{ background: 'var(--color-green-primary)', color: '#000' }}
              >
                {hasPicks ? 'Edit Picks' : 'Make Picks'}
                <ChevronRight size={14} />
              </Link>
            )
          ))}
        <Link
          to={`/pools/${poolId}/leaderboard`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm border"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          Leaderboard
        </Link>
        {/* Only worth showing on a pool that has a between-events window
            at all — a single-event pool never gets one. */}
        {isMember && isMulti && (
          <Link
            to={`/pools/${poolId}/waivers`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm border"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            Waivers
          </Link>
        )}
      </div>

      {/* Members */}
      <MembersList poolId={poolId!} rosterSize={pool.rosterSize} />

      {/* League manager button */}
      {isOwner && (
        <div className="mb-10">
          <Link
            to={`/pools/${poolId}/manage`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm border"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            <Settings size={14} /> Manage Pool
          </Link>
        </div>
      )}

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

function MembersList({ poolId, rosterSize }: { poolId: string; rosterSize: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['pool-members', poolId],
    queryFn: async () => {
      const res = await fetch(`/api/pools/leaderboard?poolId=${poolId}`)
      if (!res.ok) return { leaderboard: [] }
      return res.json()
    },
  })

  if (isLoading) return null

  const members = data?.leaderboard || []
  if (members.length === 0) {
    return (
      <div className="mb-10 rounded-xl border p-5" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
        <h3 className="font-display text-lg mb-3" style={{ color: 'var(--color-text-primary)' }}>MEMBERS</h3>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No one has joined yet. Share the join code to invite players.</p>
      </div>
    )
  }

  return (
    <div className="mb-10 rounded-xl border p-5" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
      <h3 className="font-display text-lg mb-4" style={{ color: 'var(--color-text-primary)' }}>
        MEMBERS <span className="text-sm font-normal" style={{ color: 'var(--color-text-muted)' }}>({members.length})</span>
      </h3>
      <div className="space-y-2">
        {members.map((m: any) => {
          const pickCount = (m.golferIds as string[] || []).length
          const hasPicks = pickCount === rosterSize
          return (
            <div key={m.id} className="flex items-center justify-between py-2 px-3 rounded-lg"
              style={{ background: 'var(--color-surface-2)' }}>
              <div className="flex items-center gap-2">
                {hasPicks ? (
                  <CheckCircle size={16} style={{ color: 'var(--color-green-primary)' }} />
                ) : (
                  <Circle size={16} style={{ color: 'var(--color-text-muted)' }} />
                )}
                <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  {m.displayName}
                </span>
              </div>
              <span className="text-xs font-mono" style={{ color: hasPicks ? 'var(--color-green-primary)' : 'var(--color-text-muted)' }}>
                {hasPicks ? `${pickCount}/${rosterSize} picked` : `${pickCount}/${rosterSize}`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
