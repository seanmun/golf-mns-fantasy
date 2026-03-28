import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useApi } from '@/lib/api/client'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Check, Flag } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export function PoolPick() {
  const { poolId } = useParams<{ poolId: string }>()
  const navigate = useNavigate()
  const { apiFetch } = useApi()
  const [selected, setSelected] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')

  const { data: poolData, isLoading: poolLoading } = useQuery<{ pool: any; userEntry: any }>({
    queryKey: ['pool', poolId],
    queryFn: async () => {
      const res = await fetch(`/api/pools/${poolId}`)
      if (!res.ok) throw new Error('Pool not found')
      const data = await res.json()
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
  const fieldIds = new Set((fieldData?.golfers || []).map((g: any) => g.id))
  const golfers = (golfersData?.golfers || []).filter((g: any) =>
    !search || g.name.toLowerCase().includes(search.toLowerCase())
  )

  const rosterSize = pool?.rosterSize || 6
  const isLocked = pool?.status === 'locked' || pool?.status === 'active' || new Date() >= new Date(pool?.tournamentLockTime)

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
        toast.error(`You can only pick ${rosterSize} golfers`)
        return prev
      }
      return [...prev, golferId]
    })
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-4xl" style={{ color: 'var(--color-text-primary)' }}>MAKE PICKS</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            {pool?.name} · Select {rosterSize} golfers
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-2xl font-bold" style={{ color: selected.length === rosterSize ? 'var(--color-green-primary)' : 'var(--color-text-primary)' }}>
            {selected.length}/{rosterSize}
          </div>
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>selected</div>
        </div>
      </div>

      <input
        type="text"
        placeholder="Search golfers..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none mb-6"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
      />

      <div className="grid sm:grid-cols-2 gap-2 mb-8">
        {golfers.map((golfer: any) => {
          const isSelected = selected.includes(golfer.id)
          return (
            <button
              key={golfer.id}
              onClick={() => toggle(golfer.id)}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg border text-left transition-all duration-150',
                isSelected ? 'border-green-500' : ''
              )}
              style={{
                background: isSelected ? 'var(--color-green-dim)' : 'var(--color-surface)',
                borderColor: isSelected ? 'var(--color-green-primary)' : 'var(--color-border)',
              }}
            >
              <div
                className="w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0"
                style={{
                  borderColor: isSelected ? 'var(--color-green-primary)' : 'var(--color-border)',
                  background: isSelected ? 'var(--color-green-primary)' : 'transparent',
                }}
              >
                {isSelected && <Check size={11} color="#000" strokeWidth={3} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate flex items-center gap-1.5" style={{ color: 'var(--color-text-primary)' }}>
                  {golfer.name}
                  {fieldIds.has(golfer.id) && (
                    <Flag size={11} className="text-neon-green flex-shrink-0" />
                  )}
                </div>
                <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {golfer.country || 'Unknown'}{golfer.worldRanking ? ` · #${golfer.worldRanking} WR` : ''}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <div className="sticky bottom-4">
        <button
          onClick={handleSubmit}
          disabled={submitting || selected.length !== rosterSize}
          className="w-full py-3 rounded-lg font-medium text-sm transition-opacity disabled:opacity-40"
          style={{ background: 'var(--color-green-primary)', color: '#000' }}
        >
          {submitting ? 'Saving...' : `Save ${rosterSize} Picks`}
        </button>
      </div>
    </div>
  )
}
