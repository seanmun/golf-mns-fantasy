import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { Copy, Users, ChevronRight, Pencil, Trash2, Share2, CheckCircle, Circle } from 'lucide-react'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { useApi } from '@/lib/api/client'
import { toast } from 'sonner'

export function PoolDetail() {
  const { poolId } = useParams<{ poolId: string }>()
  const { user } = useUser()
  const navigate = useNavigate()
  const { apiFetch } = useApi()
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pool', poolId],
    queryFn: async () => {
      return apiFetch(`/api/pools/${poolId}`) as Promise<{ pool: any; entryCount: number; userEntry: any }>
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

      {/* Members */}
      <MembersList poolId={poolId!} rosterSize={pool.rosterSize} />

      {/* League manager controls */}
      {isOwner && (
        <div className="mb-10 rounded-xl border p-5" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <h3 className="font-display text-lg mb-3" style={{ color: 'var(--color-text-primary)' }}>MANAGE POOL</h3>

          {editing ? (
            <div className="space-y-3">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Pool name"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              />
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Description (optional)"
                rows={3}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
                style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              />
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    setSaving(true)
                    try {
                      await apiFetch(`/api/pools/${poolId}`, {
                        method: 'PUT',
                        body: JSON.stringify({ name: editName, description: editDescription }),
                      })
                      toast.success('Pool updated')
                      setEditing(false)
                      refetch()
                    } catch (err: any) {
                      toast.error(err.message)
                    } finally {
                      setSaving(false)
                    }
                  }}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  style={{ background: 'var(--color-green-primary)', color: '#000' }}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="px-4 py-2 rounded-lg text-sm border"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => { setEditName(pool.name); setEditDescription(pool.description || ''); setEditing(true) }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm border"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                <Pencil size={13} /> Edit Pool
              </button>
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm" style={{ color: '#ef4444' }}>Are you sure?</span>
                  <button
                    onClick={async () => {
                      try {
                        await apiFetch(`/api/pools/${poolId}`, { method: 'DELETE' })
                        toast.success('Pool deleted')
                        navigate('/pools')
                      } catch (err: any) {
                        toast.error(err.message)
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium"
                    style={{ background: '#ef4444', color: '#fff' }}
                  >
                    Yes, delete
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-1.5 rounded-lg text-sm border"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm border"
                  style={{ borderColor: '#ef4444', color: '#ef4444' }}
                >
                  <Trash2 size={13} /> Delete Pool
                </button>
              )}
            </div>
          )}
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
