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
    // One id for a normal pool; several for a multi-week pool that
    // accumulates points across every event in the list.
    tournamentIds: [] as string[],
    rosterSize: 6,
    isPublic: true,
    pickMode: 'pickem' as 'pickem' | 'draft',
    // null = slow draft (12h per pick); a number is seconds on the clock.
    draftPickSeconds: 120 as number | null,
  })
  const [span, setSpan] = useState<'single' | 'multi'>('single')
  // Multi-week needs an explicit "done picking" step; single advances on
  // the click itself.
  const [eventsConfirmed, setEventsConfirmed] = useState(false)

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

  // Always in play order — the first event locks the pool and its field
  // is what gets drafted.
  const selected = tournaments.filter((t: any) => form.tournamentIds.includes(t.id))

  const fmtDates = (t: any) => {
    const s = new Date(t.startDate)
    const e = new Date(t.endDate)
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
    return `${s.toLocaleDateString('en-US', opts)}–${e.toLocaleDateString('en-US', opts)}`
  }

  function pickSingle(id: string) {
    setForm({ ...form, tournamentIds: [id] })
    setEventsConfirmed(true)
  }

  function toggleEvent(id: string) {
    const has = form.tournamentIds.includes(id)
    setForm({
      ...form,
      tournamentIds: has
        ? form.tournamentIds.filter((x) => x !== id)
        : [...form.tournamentIds, id],
    })
  }

  function changeSpan(next: 'single' | 'multi') {
    setSpan(next)
    setForm({ ...form, tournamentIds: [] })
    setEventsConfirmed(false)
    if (next === 'multi') setShowAllEvents(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || form.tournamentIds.length === 0) {
      toast.error('Pool name and at least one event are required')
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

      {/* Step 1: how many events, then which */}
      {!eventsConfirmed ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 mb-5">
            {([
              ['single', 'Single event', 'One tournament, one set of picks.'],
              ['multi', 'Multi-week', 'Points accumulate across every event you choose.'],
            ] as const).map(([value, label, blurb]) => (
              <button
                key={value}
                type="button"
                onClick={() => changeSpan(value)}
                className="text-left p-3 rounded-lg border transition-colors"
                style={{
                  background: 'var(--color-surface)',
                  borderColor: span === value ? 'var(--color-green-primary)' : 'var(--color-border)',
                }}
              >
                <div className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  {label}
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{blurb}</p>
              </button>
            ))}
          </div>

          <p className="text-sm mb-2" style={{ color: 'var(--color-text-secondary)' }}>
            {span === 'multi'
              ? 'Which events should this pool score?'
              : 'Which event is this pool for?'}
          </p>

          {span === 'multi' ? (
            <>
              {tournaments.map((t: any) => {
                const checked = form.tournamentIds.includes(t.id)
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleEvent(t.id)}
                    className="w-full flex items-center gap-3 text-left px-4 py-3 rounded-lg border transition-colors hover:opacity-90"
                    style={{
                      background: 'var(--color-surface)',
                      borderColor: checked ? 'var(--color-green-primary)' : 'var(--color-border)',
                    }}
                  >
                    <span
                      className="flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold shrink-0"
                      style={{
                        background: checked ? 'var(--color-green-primary)' : 'transparent',
                        border: checked ? 'none' : '1px solid var(--color-border)',
                        color: '#000',
                      }}
                    >
                      {checked ? '✓' : ''}
                    </span>
                    <span className="flex-1">
                      <span className="text-sm font-medium block" style={{ color: 'var(--color-text-primary)' }}>
                        {t.name}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {t.course} · {fmtDates(t)}
                      </span>
                    </span>
                  </button>
                )
              })}

              {form.tournamentIds.length > 0 && (
                <p className="text-xs pt-1" style={{ color: 'var(--color-text-muted)' }}>
                  Rosters lock when <strong style={{ color: 'var(--color-text-secondary)' }}>{selected[0].name}</strong> tees
                  off and ride all {selected.length} {selected.length === 1 ? 'event' : 'events'}. You draft from that
                  event's field — golfers keep scoring only as long as they keep advancing.
                </p>
              )}

              <button
                type="button"
                onClick={() => setEventsConfirmed(true)}
                disabled={form.tournamentIds.length === 0}
                className="w-full py-3 rounded-lg font-medium text-sm transition-opacity disabled:opacity-40"
                style={{ background: 'var(--color-green-primary)', color: '#000' }}
              >
                {form.tournamentIds.length === 0
                  ? 'Select at least one event'
                  : `Continue with ${form.tournamentIds.length} ${form.tournamentIds.length === 1 ? 'event' : 'events'}`}
              </button>
            </>
          ) : (
            <>
              {featured && (
                <button
                  type="button"
                  onClick={() => pickSingle(featured.id)}
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
                  onClick={() => pickSingle(t.id)}
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
                    onClick={() => pickSingle(t.id)}
                    className="w-full text-left px-4 py-3 rounded-lg border transition-colors hover:opacity-90"
                    style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
                  >
                    <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{t.name}</span>
                    <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>{fmtDates(t)}</span>
                  </button>
                ))}
            </>
          )}

          {tournaments.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              No upcoming events available — ask the site admin to import the season schedule.
            </p>
          )}
        </div>
      ) : (
      <form onSubmit={handleSubmit} className="space-y-5">
        <div
          className="p-4 rounded-lg border"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              {selected.map((t: any, i: number) => (
                <div key={t.id}>
                  <div className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>
                    {selected.length > 1 && (
                      <span className="font-mono mr-1.5" style={{ color: 'var(--color-text-muted)' }}>{i + 1}.</span>
                    )}
                    {t.name}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                    {t.course} · {fmtDates(t)}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setEventsConfirmed(false)}
              className="text-xs underline shrink-0"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Change {selected.length > 1 ? 'events' : 'event'}
            </button>
          </div>
          {selected.length > 1 && (
            <p className="text-xs mt-3 pt-3" style={{ color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)' }}>
              Points accumulate across all {selected.length} events. One draft, one roster.
            </p>
          )}
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
            Format
          </label>
          <div className="grid grid-cols-2 gap-2">
            {([
              ['pickem', "Pick'em", 'Everyone picks freely — two teams can have the same golfer.'],
              ['draft', 'Draft', 'Snake draft; each golfer can only be taken once.'],
            ] as const).map(([value, label, blurb]) => (
              <button
                key={value}
                type="button"
                onClick={() => setForm({ ...form, pickMode: value })}
                className="text-left p-3 rounded-lg border transition-colors"
                style={{
                  background: 'var(--color-surface)',
                  borderColor:
                    form.pickMode === value ? 'var(--color-green-primary)' : 'var(--color-border)',
                }}
              >
                <div className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  {label}
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{blurb}</p>
              </button>
            ))}
          </div>
        </div>

        {form.pickMode === 'draft' && (
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
              Pick clock
            </label>
            <select
              value={form.draftPickSeconds === null ? 'slow' : String(form.draftPickSeconds)}
              onChange={(e) =>
                setForm({
                  ...form,
                  draftPickSeconds: e.target.value === 'slow' ? null : Number(e.target.value),
                })
              }
              className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            >
              <option value="60">1 minute per pick</option>
              <option value="120">2 minutes per pick</option>
              <option value="300">5 minutes per pick</option>
              <option value="900">15 minutes per pick</option>
              <option value="3600">1 hour per pick</option>
              <option value="7200">2 hours per pick</option>
              <option value="14400">4 hours per pick</option>
              <option value="28800">8 hours per pick</option>
              <option value="slow">12 hours per pick (slow draft)</option>
              <option value="86400">24 hours per pick</option>
            </select>
            <p className="mt-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Everyone is emailed when they're up. Miss the clock and your queue —
              or the best available golfer — is picked for you.
            </p>
          </div>
        )}

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
