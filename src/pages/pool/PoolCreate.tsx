import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useApi } from '@/lib/api/client'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { toast } from 'sonner'

export function PoolCreate() {
  const navigate = useNavigate()
  const { apiFetch } = useApi()
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    name: '',
    description: '',
    tournamentId: '',
    rosterSize: 6,
    isPublic: true,
  })

  const { data: tournamentsData, isLoading } = useQuery({
    queryKey: ['tournaments'],
    queryFn: async () => {
      const res = await fetch('/api/tournaments')
      if (!res.ok) throw new Error('Failed to load tournaments')
      return res.json()
    },
  })

  const [showAllEvents, setShowAllEvents] = useState(false)

  const tournaments = (tournamentsData?.tournaments?.filter(
    (t: any) =>
      (t.status === 'upcoming' || t.status === 'active') &&
      new Date(t.endDate).getTime() > Date.now() - 24 * 60 * 60 * 1000
  ) || []).sort(
    (a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  )

  const featured = tournaments[0]
  const nextThree = tournaments.slice(1, 4)
  const rest = tournaments.slice(4)
  const selected = tournaments.find((t: any) => t.id === form.tournamentId)

  const fmtDates = (t: any) => {
    const s = new Date(t.startDate)
    const e = new Date(t.endDate)
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
    return `${s.toLocaleDateString('en-US', opts)}–${e.toLocaleDateString('en-US', opts)}`
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.tournamentId) {
      toast.error('Pool name and tournament are required')
      return
    }
    setSubmitting(true)
    try {
      const { pool } = await apiFetch<{ pool: any }>('/api/pools', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      toast.success('Pool created!')
      navigate(`/pools/${pool.id}`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create pool')
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading) return <LoadingSpinner />

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <h1 className="font-display text-4xl mb-8" style={{ color: 'var(--color-text-primary)' }}>
        CREATE POOL
      </h1>

      {/* Step 1: pick the event */}
      {!selected ? (
        <div className="space-y-3">
          <p className="text-sm mb-2" style={{ color: 'var(--color-text-secondary)' }}>
            Which event is this pool for?
          </p>

          {featured && (
            <button
              type="button"
              onClick={() => setForm({ ...form, tournamentId: featured.id })}
              className="w-full text-left p-5 rounded-xl border-2 transition-colors hover:opacity-90"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-green-primary)' }}
            >
              <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--color-green-primary)' }}>
                {featured.status === 'active' ? 'Live now' : 'Up next'}
              </div>
              <div className="font-display text-2xl" style={{ color: 'var(--color-text-primary)' }}>{featured.name}</div>
              <div className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                {featured.course} · {fmtDates(featured)}
              </div>
            </button>
          )}

          {nextThree.map((t: any) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setForm({ ...form, tournamentId: t.id })}
              className="w-full text-left px-4 py-3 rounded-lg border transition-colors hover:opacity-90"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
            >
              <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{t.name}</span>
              <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>{fmtDates(t)}</span>
            </button>
          ))}

          {rest.length > 0 && !showAllEvents && (
            <button
              type="button"
              onClick={() => setShowAllEvents(true)}
              className="w-full py-2 text-sm"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Show all {tournaments.length} events ↓
            </button>
          )}
          {showAllEvents &&
            rest.map((t: any) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setForm({ ...form, tournamentId: t.id })}
                className="w-full text-left px-4 py-3 rounded-lg border transition-colors hover:opacity-90"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
              >
                <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{t.name}</span>
                <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>{fmtDates(t)}</span>
              </button>
            ))}

          {tournaments.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              No upcoming events available — ask the site admin to import the season schedule.
            </p>
          )}
        </div>
      ) : (
      <form onSubmit={handleSubmit} className="space-y-5">
        <div
          className="flex items-center justify-between p-4 rounded-lg border"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        >
          <div>
            <div className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>{selected.name}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
              {selected.course} · {fmtDates(selected)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setForm({ ...form, tournamentId: '' })}
            className="text-xs underline"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Change event
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
            Pool Name
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. The Green Jacket Pool"
            className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none focus:ring-1"
            style={{
              background: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
            Picks per Team
          </label>
          <select
            value={form.rosterSize}
            onChange={(e) => setForm({ ...form, rosterSize: Number(e.target.value) })}
            className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
          >
            {[4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>{n} golfers</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
            Description (optional)
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none resize-none"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
          />
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="isPublic"
            checked={form.isPublic}
            onChange={(e) => setForm({ ...form, isPublic: e.target.checked })}
            className="rounded"
          />
          <label htmlFor="isPublic" className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Public pool (visible to everyone)
          </label>
        </div>
        {!form.isPublic && (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            A private join code will be generated after creation.
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-lg font-medium text-sm transition-opacity disabled:opacity-50"
          style={{ background: 'var(--color-green-primary)', color: '#000' }}
        >
          {submitting ? 'Creating...' : 'Create Pool'}
        </button>
      </form>
      )}
    </div>
  )
}
