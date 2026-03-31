import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useApi } from '@/lib/api/client'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Flag, User } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export function PoolPick() {
  const { poolId } = useParams<{ poolId: string }>()
  const navigate = useNavigate()
  const { apiFetch } = useApi()
  const [selected, setSelected] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'available' | 'roster'>('available')

  const { data: poolData, isLoading: poolLoading } = useQuery<{ pool: any; userEntry: any }>({
    queryKey: ['pool', poolId],
    queryFn: async () => {
      const data = await apiFetch(`/api/pools/${poolId}`) as { pool: any; userEntry: any }
      if (data.userEntry?.golferIds?.length) {
        setSelected(data.userEntry.golferIds)
      }
      return data
    },
  })

  // Fetch all active golfers
  const { data: golfersData, isLoading: golfersLoading } = useQuery({
    queryKey: ['all-golfers'],
    queryFn: async () => {
      const res = await fetch('/api/golfers')
      if (!res.ok) throw new Error('Failed to load golfers')
      return res.json()
    },
  })

  // Fetch tournament field to flag registered golfers
  const { data: fieldData } = useQuery({
    queryKey: ['field', poolData?.pool?.tournamentId],
    enabled: !!poolData?.pool?.tournamentId,
    queryFn: async () => {
      const res = await fetch(`/api/golfers?tournamentId=${poolData!.pool.tournamentId}`)
      if (!res.ok) return { golfers: [] }
      return res.json()
    },
  })

  if (poolLoading || golfersLoading) return <LoadingSpinner />

  const pool = poolData?.pool
  const allGolfers = golfersData?.golfers || []
  const golferMap = Object.fromEntries(allGolfers.map((g: any) => [g.id, g]))
  const fieldIds = new Set((fieldData?.golfers || []).map((g: any) => g.id))

  const filteredGolfers = allGolfers.filter((g: any) =>
    !search || g.name.toLowerCase().includes(search.toLowerCase())
  )

  const rosterSize = pool?.rosterSize || 6
  const isLocked = pool?.status === 'locked' || pool?.status === 'active' || new Date() >= new Date(pool?.tournamentLockTime)
  const rosterFull = selected.length >= rosterSize

  if (isLocked) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <p className="text-lg mb-2" style={{ color: 'var(--color-text-primary)' }}>Picks are locked</p>
        <button onClick={() => navigate(`/pools/${poolId}`)} className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Back to pool
        </button>
      </div>
    )
  }

  function toggle(golferId: string) {
    setSelected((prev) => {
      if (prev.includes(golferId)) return prev.filter((id) => id !== golferId)
      if (prev.length >= rosterSize) {
        toast.error(`Drop a player first — roster is full (${rosterSize}/${rosterSize})`)
        return prev
      }
      return [...prev, golferId]
    })
  }

  function drop(golferId: string) {
    setSelected((prev) => prev.filter((id) => id !== golferId))
  }

  async function handleSubmit() {
    if (selected.length !== rosterSize) {
      toast.error(`Pick exactly ${rosterSize} golfers`)
      return
    }
    setSubmitting(true)
    try {
      await apiFetch('/api/pools/entries', {
        method: 'POST',
        body: JSON.stringify({ poolId, golferIds: selected }),
      })
      toast.success('Picks saved!')
      navigate(`/pools/${poolId}`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to save picks')
    } finally {
      setSubmitting(false)
    }
  }

  const rosterPanel = (
    <div className="rounded-xl border p-4" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-lg" style={{ color: 'var(--color-text-primary)' }}>YOUR ROSTER</h3>
        <span className="font-mono text-sm font-bold" style={{ color: selected.length === rosterSize ? 'var(--color-green-primary)' : 'var(--color-text-muted)' }}>
          {selected.length}/{rosterSize}
        </span>
      </div>

      <div className="space-y-1.5">
        {Array.from({ length: rosterSize }).map((_, i) => {
          const golferId = selected[i]
          const golfer = golferId ? golferMap[golferId] : null

          if (!golfer) {
            return (
              <div key={i} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed"
                style={{ borderColor: 'var(--color-border)' }}>
                <User size={14} style={{ color: 'var(--color-text-muted)' }} />
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Empty slot</span>
              </div>
            )
          }

          return (
            <div key={i} className="flex items-center gap-2 px-3 py-2.5 rounded-lg"
              style={{ background: 'var(--color-green-dim)', border: '1px solid var(--color-green-muted)' }}>
              <div className="flex-1 min-w-0">
                <Link to={`/players/${golferId}`} className="text-sm font-medium truncate block hover:text-neon-green transition-colors" style={{ color: 'var(--color-text-primary)' }}>
                  {golfer.name}
                </Link>
                <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                  {golfer.country}{golfer.worldRanking ? ` · #${golfer.worldRanking}` : ''}
                </div>
              </div>
              <button onClick={() => drop(golferId)} className="px-2 py-1 rounded text-[10px] font-medium hover:opacity-80 transition-opacity flex-shrink-0"
                style={{ background: 'var(--color-score-bogey)', color: '#fff' }}>
                Drop
              </button>
            </div>
          )
        })}
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting || selected.length !== rosterSize}
        className="w-full mt-4 py-2.5 rounded-lg font-medium text-sm transition-opacity disabled:opacity-40"
        style={{ background: 'var(--color-green-primary)', color: '#000' }}
      >
        {submitting ? 'Saving...' : `Save ${rosterSize} Picks`}
      </button>
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl" style={{ color: 'var(--color-text-primary)' }}>MAKE PICKS</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            {pool?.name} · Select {rosterSize} golfers
          </p>
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="flex gap-2 mb-4 sm:hidden">
        <button
          onClick={() => setTab('available')}
          className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: tab === 'available' ? 'var(--color-green-primary)' : 'var(--color-surface)',
            color: tab === 'available' ? '#000' : 'var(--color-text-secondary)',
            border: tab === 'available' ? 'none' : '1px solid var(--color-border)',
          }}
        >
          Available ({filteredGolfers.length})
        </button>
        <button
          onClick={() => setTab('roster')}
          className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: tab === 'roster' ? 'var(--color-green-primary)' : 'var(--color-surface)',
            color: tab === 'roster' ? '#000' : 'var(--color-text-secondary)',
            border: tab === 'roster' ? 'none' : '1px solid var(--color-border)',
          }}
        >
          Roster ({selected.length}/{rosterSize})
        </button>
      </div>

      <div className="flex gap-6">
        {/* Available golfers - hidden on mobile when roster tab active */}
        <div className={cn('flex-1 min-w-0', tab === 'roster' ? 'hidden sm:block' : '')}>
          <input
            type="text"
            placeholder="Search golfers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none mb-4"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
          />

          {rosterFull && (
            <div className="mb-4 px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--color-green-dim)', color: 'var(--color-green-primary)' }}>
              Roster full — drop a player from your roster to pick someone new
            </div>
          )}

          <div className="grid gap-2">
            {filteredGolfers.map((golfer: any) => {
              const isSelected = selected.includes(golfer.id)
              return (
                <div
                  key={golfer.id}
                  className="flex items-center gap-3 p-3 rounded-lg border transition-all duration-150"
                  style={{
                    background: isSelected ? 'var(--color-green-dim)' : 'var(--color-surface)',
                    borderColor: isSelected ? 'var(--color-green-primary)' : 'var(--color-border)',
                    opacity: rosterFull && !isSelected ? 0.5 : 1,
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/players/${golfer.id}`}
                      className="font-medium text-sm truncate flex items-center gap-1.5 hover:text-neon-green transition-colors"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {golfer.name}
                      {fieldIds.has(golfer.id) && (
                        <Flag size={11} className="text-neon-green flex-shrink-0" />
                      )}
                    </Link>
                    <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {golfer.country || 'Unknown'}{golfer.worldRanking ? ` · #${golfer.worldRanking} WR` : ''}
                    </div>
                  </div>
                  {isSelected ? (
                    <button
                      onClick={() => toggle(golfer.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0 transition-colors"
                      style={{ background: 'var(--color-score-bogey)', color: '#fff' }}
                    >
                      Drop
                    </button>
                  ) : (
                    <button
                      onClick={() => toggle(golfer.id)}
                      disabled={rosterFull}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0 transition-colors disabled:opacity-40"
                      style={{ background: 'var(--color-green-primary)', color: '#000' }}
                    >
                      Pick
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Roster panel - sidebar on desktop, tab on mobile */}
        <div className={cn('sm:w-80 sm:flex-shrink-0', tab === 'available' ? 'hidden sm:block' : 'w-full')}>
          <div className="sm:sticky sm:top-20">
            {rosterPanel}
          </div>
        </div>
      </div>
    </div>
  )
}
