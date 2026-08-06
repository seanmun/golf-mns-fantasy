import { useState } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useUser } from '@clerk/clerk-react'
import { useApi } from '@/lib/api/client'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { toast } from 'sonner'

// Shows the pool and waits for a deliberate tap. This used to join
// silently on mount, so a failure surfaced as a toast with nothing to
// retry — and you couldn't see what you were joining.
//
// The page is reachable signed out: the preview endpoint is public, and
// an invite that bounces you to a login screen before it says what the
// invite IS gets abandoned. Auth is asked for at the Join tap.
export function PoolJoin() {
  const { joinCode } = useParams<{ joinCode: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { isSignedIn } = useUser()
  const { apiFetch } = useApi()
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['join-preview', joinCode],
    enabled: !!joinCode,
    queryFn: () =>
      apiFetch(`/api/pools/join?joinCode=${joinCode}`) as Promise<{
        pool: any
        entryCount: number
        alreadyJoined: boolean
      }>,
  })

  const join = async () => {
    setJoining(true)
    setError(null)
    try {
      const { pool } = await apiFetch<{ pool: any }>('/api/pools/join', {
        method: 'POST',
        body: JSON.stringify({ joinCode }),
      })
      toast.success("You're in")
      navigate(`/pools/${pool.id}`)
    } catch (err: any) {
      setError(err.message || 'Could not join this pool')
    } finally {
      setJoining(false)
    }
  }

  if (isLoading) return <LoadingSpinner />

  if (!data?.pool) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-lg mb-2" style={{ color: 'var(--color-text-primary)' }}>
          That join code didn't match a pool
        </p>
        <p className="text-sm mb-5" style={{ color: 'var(--color-text-muted)' }}>
          Code <span className="font-mono">{joinCode}</span> — check it with whoever invited you.
        </p>
        <Link
          to="/pools"
          className="inline-block px-5 py-2.5 rounded-lg text-sm font-medium"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          Browse pools
        </Link>
      </div>
    )
  }

  const { pool, entryCount, alreadyJoined } = data
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--color-text-muted)' }}>
        You've been invited to
      </p>

      <div
        className="rounded-xl border p-5 mb-5"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <h1 className="font-display text-3xl mb-1" style={{ color: 'var(--color-text-primary)' }}>
          {pool.name}
        </h1>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {pool.tournamentName} · {pool.tournamentCourse}
        </p>
        {pool.description && (
          <p className="text-sm mt-3" style={{ color: 'var(--color-text-secondary)' }}>
            {pool.description}
          </p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <span>{entryCount} {entryCount === 1 ? 'team' : 'teams'} in</span>
          <span>Pick {pool.rosterSize} golfers</span>
          <span>{pool.pickMode === 'draft' ? 'Snake draft' : "Pick'em"}</span>
          <span>Starts {fmt(pool.tournamentStartDate)}</span>
        </div>
      </div>

      {alreadyJoined ? (
        <>
          <p className="text-sm mb-3" style={{ color: 'var(--color-green-primary)' }}>
            You're already in this pool.
          </p>
          <Link
            to={`/pools/${pool.id}`}
            className="block w-full py-3 rounded-lg font-medium text-sm text-center"
            style={{ background: 'var(--color-green-primary)', color: '#000' }}
          >
            Go to pool
          </Link>
        </>
      ) : !isSignedIn ? (
        <>
          <Link
            to={`/sign-up?redirect_url=${encodeURIComponent(location.pathname)}`}
            className="block w-full py-3 rounded-lg font-medium text-sm text-center"
            style={{ background: 'var(--color-green-primary)', color: '#000' }}
          >
            Sign up to join
          </Link>
          <Link
            to={`/sign-in?redirect_url=${encodeURIComponent(location.pathname)}`}
            className="block w-full py-3 mt-3 rounded-lg font-medium text-sm text-center border"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            Already have an account? Sign in
          </Link>
        </>
      ) : (
        <>
          <button
            onClick={join}
            disabled={joining}
            className="w-full py-3 rounded-lg font-medium text-sm disabled:opacity-50"
            style={{ background: 'var(--color-green-primary)', color: '#000' }}
          >
            {joining ? 'Joining…' : 'Join Pool'}
          </button>
          {error && (
            <div className="mt-4">
              <p className="text-sm mb-2" style={{ color: 'var(--color-score-bogey)' }}>{error}</p>
              <button
                onClick={join}
                className="text-sm underline"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Try again
              </button>
            </div>
          )}
        </>
      )}

      <p className="mt-5 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
        Join code <span className="font-mono">{joinCode}</span>
      </p>
    </div>
  )
}
