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

  const tournaments = tournamentsData?.tournaments?.filter(
    (t: any) => t.status === 'upcoming' || t.status === 'active'
  ) || []

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

      <form onSubmit={handleSubmit} className="space-y-5">
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
            Tournament
          </label>
          <select
            value={form.tournamentId}
            onChange={(e) => setForm({ ...form, tournamentId: e.target.value })}
            className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
            style={{
              background: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
              color: form.tournamentId ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            }}
            required
          >
            <option value="">Select a tournament</option>
            {tournaments.map((t: any) => (
              <option key={t.id} value={t.id}>{t.name} — {t.course}</option>
            ))}
          </select>
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
    </div>
  )
}
