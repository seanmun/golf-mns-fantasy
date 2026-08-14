import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, X } from 'lucide-react'
import { toast } from 'sonner'
import { useApi } from '@/lib/api/client'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

interface RosterGolfer {
  id: string
  name: string
  worldRanking: number | null
  // False means they didn't advance — this is the spot you're replacing.
  inNextField: boolean
}

interface FreeAgent {
  id: string
  name: string
  worldRanking: number | null
  teeTime: string | null
}

export function PoolWaivers() {
  const { poolId } = useParams<{ poolId: string }>()
  const { apiFetch } = useApi()
  const qc = useQueryClient()
  const [drop, setDrop] = useState<string | null>(null)
  const [adds, setAdds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['waivers', poolId],
    queryFn: () => apiFetch(`/api/pools/waivers?poolId=${poolId}`) as Promise<any>,
  })

  if (isLoading) return <LoadingSpinner />
  if (!data) return null

  const { window: win, priority = [], myRoster = [], freeAgents = [], myClaim } = data
  const myPosition = priority.find((p: any) => p.isMe)?.position

  const filtered = (freeAgents as FreeAgent[]).filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase())
  )

  async function submit() {
    if (!drop || adds.length === 0) return
    setBusy(true)
    try {
      await apiFetch('/api/pools/waivers', {
        method: 'POST',
        body: JSON.stringify({ poolId, dropGolferId: drop, addGolferIds: adds }),
      })
      toast.success('Claim submitted')
      await qc.invalidateQueries({ queryKey: ['waivers', poolId] })
      setDrop(null)
      setAdds([])
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function cancel() {
    setBusy(true)
    try {
      await apiFetch(`/api/pools/waivers?poolId=${poolId}`, { method: 'DELETE' })
      toast.success('Claim withdrawn')
      await qc.invalidateQueries({ queryKey: ['waivers', poolId] })
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Link to={`/pools/${poolId}`} className="inline-flex items-center gap-1 text-sm mb-4"
        style={{ color: 'var(--color-text-muted)' }}>
        <ChevronLeft size={14} /> Back to pool
      </Link>
      <h1 className="font-display text-4xl mb-1" style={{ color: 'var(--color-text-primary)' }}>
        WAIVERS
      </h1>
      {win?.tournamentName && (
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          For {win.tournamentName}
          {win.processAt && (
            <> · processed {new Date(win.processAt).toLocaleString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
            })}</>
          )}
        </p>
      )}

      {!win?.isOpen && (
        <div className="rounded-xl border p-5 mb-6"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {win?.reason ?? 'Waivers are not open.'}
          </p>
        </div>
      )}

      {/* Where you sit. Public on purpose — knowing you pick third is
          the entire strategic point of a priority order. */}
      {priority.length > 0 && (
        <div className="rounded-xl border p-4 mb-6"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2"
            style={{ color: 'var(--color-text-secondary)' }}>
            Waiver order · highest score picks first
          </div>
          <div className="space-y-1">
            {priority.map((p: any) => (
              <div key={p.position} className="flex items-center justify-between text-sm">
                <span style={{ color: p.isMe ? 'var(--color-green-primary)' : 'var(--color-text-primary)' }}>
                  <span className="font-mono mr-2" style={{ color: 'var(--color-text-muted)' }}>{p.position}</span>
                  {p.team}{p.isMe && ' (you)'}
                </span>
                <span className="font-mono text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {p.points.toFixed(0)} pts
                </span>
              </div>
            ))}
          </div>
          {myPosition && (
            <p className="text-xs mt-3" style={{ color: 'var(--color-text-muted)' }}>
              You pick {ordinal(myPosition)} of {priority.length}.
              {myPosition > 1 && ' List backups — if someone above you takes your first choice, the next one still lands.'}
            </p>
          )}
        </div>
      )}

      {myClaim && myClaim.status === 'pending' && (
        <div className="rounded-xl border p-4 mb-6"
          style={{ background: 'var(--color-green-dim)', borderColor: 'var(--color-green-muted)' }}>
          <div className="flex items-center justify-between">
            <div className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
              Claim submitted — dropping{' '}
              <strong>{myRoster.find((r: RosterGolfer) => r.id === myClaim.dropGolferId)?.name ?? '—'}</strong>
            </div>
            <button onClick={cancel} disabled={busy} className="text-xs underline"
              style={{ color: 'var(--color-text-secondary)' }}>
              Withdraw
            </button>
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Submitting a new one replaces it — one transaction per window.
          </p>
        </div>
      )}

      {win?.isOpen && (
        <>
          {/* Drop first: the roster is where the problem is visible. */}
          <h2 className="font-display text-lg mb-1" style={{ color: 'var(--color-text-primary)' }}>
            1 · WHO DROPS
          </h2>
          <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
            Any of them — you don't have to drop an eliminated golfer.
          </p>
          <div className="grid grid-cols-2 gap-2 mb-6">
            {(myRoster as RosterGolfer[]).map((g) => (
              <button
                key={g.id}
                onClick={() => setDrop(drop === g.id ? null : g.id)}
                className="text-left px-3 py-2.5 rounded-lg border transition-colors"
                style={{
                  background: 'var(--color-surface)',
                  // Eliminated golfers get an outline, not dimming — they
                  // are the likeliest drop, so they should draw the eye
                  // rather than read as unavailable.
                  borderColor: drop === g.id
                    ? 'var(--color-score-bogey)'
                    : g.inNextField
                      ? 'var(--color-border)'
                      : 'var(--color-score-bogey)',
                }}
              >
                <div className="text-sm" style={{ color: 'var(--color-text-primary)' }}>{g.name}</div>
                <div className="text-[11px]" style={{
                  color: g.inNextField ? 'var(--color-text-muted)' : 'var(--color-score-bogey)',
                }}>
                  {g.inNextField
                    ? `World #${g.worldRanking ?? '—'} · playing`
                    : 'Did not advance — scores nothing'}
                </div>
              </button>
            ))}
          </div>

          <h2 className="font-display text-lg mb-2" style={{ color: 'var(--color-text-primary)' }}>
            2 · WHO JOINS
          </h2>
          {adds.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {adds.map((id, i) => {
                const g = (freeAgents as FreeAgent[]).find((f) => f.id === id)
                return (
                  <span key={id}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs"
                    style={{ background: 'var(--color-green-dim)', color: 'var(--color-green-primary)', border: '1px solid var(--color-green-muted)' }}>
                    <span className="font-mono">{i + 1}</span>
                    {g?.name ?? id}
                    <button onClick={() => setAdds(adds.filter((a) => a !== id))}>
                      <X size={11} />
                    </button>
                  </span>
                )
              })}
            </div>
          )}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search free agents"
            className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none mb-2"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
          />
          <div className="rounded-lg border divide-y max-h-80 overflow-y-auto mb-6"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
            {filtered.slice(0, 60).map((g) => (
              <button
                key={g.id}
                onClick={() => setAdds(adds.includes(g.id) ? adds.filter((a) => a !== g.id) : [...adds, g.id])}
                className="w-full flex items-center justify-between px-3 py-2 text-left"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>{g.name}</span>
                <span className="text-xs font-mono" style={{ color: adds.includes(g.id) ? 'var(--color-green-primary)' : 'var(--color-text-muted)' }}>
                  {adds.includes(g.id) ? `#${adds.indexOf(g.id) + 1} choice` : `World #${g.worldRanking ?? '—'}`}
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                No free agents match.
              </p>
            )}
          </div>

          <button
            onClick={submit}
            disabled={busy || !drop || adds.length === 0}
            className="w-full py-3 rounded-lg font-medium text-sm disabled:opacity-40"
            style={{ background: 'var(--color-green-primary)', color: '#000' }}
          >
            {!drop
              ? 'Pick who drops'
              : adds.length === 0
                ? 'Pick who joins'
                : `Submit claim — ${adds.length} choice${adds.length > 1 ? 's' : ''}`}
          </button>
        </>
      )}
    </div>
  )
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
