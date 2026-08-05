import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth, useUser } from '@clerk/clerk-react'
import { toast } from 'sonner'
import { useApi } from '@/lib/api/client'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

const HUB = import.meta.env.VITE_PLATFORM_URL || 'https://mnsfantasy.com'

interface DraftState {
  draft: {
    id: string
    name: string
    status: 'setup' | 'active' | 'paused' | 'complete' | 'cancelled'
    rounds: number
    pickSeconds: number | null
    slowPickHours: number
    currentOverall: number | null
    currentDeadline: string | null
    createdBy: string
  }
  participants: Array<{ id: string; userId: string; teamName: string; slot: number }>
  board: Array<{
    overall: number
    round: number
    pickInRound: number
    participantId: string
    madeAt: string | null
    isAuto: boolean
    item: { id: string; name: string; meta: Record<string, unknown> | null } | null
  }>
  myQueue: string[]
  myAutodraft: boolean
  current: { overall: number; round: number; pickInRound: number; participantId: string } | null
  onTheClock: { id: string; teamName: string; userId: string } | null
  isMyTurn: boolean
  available: Array<{
    id: string
    name: string
    rankHint: number | null
    meta: Record<string, unknown> | null
  }>
}

function useCountdown(deadline: string | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  if (!deadline) return null
  const ms = new Date(deadline).getTime() - now
  if (ms <= 0) return '0:00'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}h ${m}m` : `${m}:${String(s).padStart(2, '0')}`
}

export function PoolDraft() {
  const { poolId } = useParams<{ poolId: string }>()
  const { user } = useUser()
  const { getToken } = useAuth()
  const { apiFetch } = useApi()
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  // Mobile only: the two columns become tabs so the queue isn't buried
  // under the whole field list.
  const [mobileTab, setMobileTab] = useState<'draft' | 'queue' | 'team'>('draft')
  const expiredFor = useRef<number | null>(null)

  const { data: poolData } = useQuery({
    queryKey: ['pool', poolId],
    queryFn: () => apiFetch(`/api/pools/${poolId}`) as Promise<{ pool: any }>,
  })
  const pool = poolData?.pool
  const draftId = pool?.draftId as string | undefined

  const hubFetch = async (path: string, init?: RequestInit) => {
    const token = await getToken()
    const res = await fetch(`${HUB}/api/draft${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`)
    return body
  }

  const { data: state, refetch } = useQuery<DraftState>({
    queryKey: ['draft', draftId],
    enabled: !!draftId,
    queryFn: () => hubFetch(`/${draftId}`),
    // Fast enough to feel live during a timed draft.
    refetchInterval: 5000,
  })

  const countdown = useCountdown(state?.draft.currentDeadline ?? null)

  // A 2-minute clock can't wait for the hub's hourly cron, so whoever is
  // watching nudges the auto-pick once a deadline visibly passes.
  useEffect(() => {
    if (!state || state.draft.status !== 'active' || !state.draft.currentDeadline) return
    const overall = state.draft.currentOverall
    if (overall == null || expiredFor.current === overall) return
    const ms = new Date(state.draft.currentDeadline).getTime() - Date.now()
    if (ms > 0) return
    expiredFor.current = overall
    void (async () => {
      try {
        const token = await getToken()
        await fetch(`${HUB}/api/cron/draft-clock?draftId=${state.draft.id}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
        void refetch()
      } catch {
        /* the cron will catch it */
      }
    })()
  }, [state, getToken, refetch])

  // Rosters save themselves the moment the board finishes — nobody has
  // to remember to press a button.
  const savedFor = useRef<string | null>(null)
  useEffect(() => {
    if (state?.draft.status !== 'complete' || !poolId) return
    if (savedFor.current === state.draft.id) return
    savedFor.current = state.draft.id
    void apiFetch('/api/pools/draft-sync', {
      method: 'POST',
      body: JSON.stringify({ poolId }),
    }).catch(() => {
      /* the owner can still press Save rosters */
    })
  }, [state?.draft.status, state?.draft.id, poolId, apiFetch])

  const teamById = useMemo(
    () => new Map((state?.participants ?? []).map((p) => [p.id, p])),
    [state?.participants]
  )

  const myPicks = useMemo(() => {
    if (!state || !user) return []
    const me = state.participants.find((p) => p.userId === user.id)
    if (!me) return []
    return state.board.filter((b) => b.participantId === me.id && b.item)
  }, [state, user])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = state?.available ?? []
    return q ? list.filter((i) => i.name.toLowerCase().includes(q)) : list
  }, [state?.available, search])

  const isOwner = !!user && pool?.createdBy === user.id

  const poolAction = async (action: string) => {
    setBusy(true)
    try {
      const r = await apiFetch<any>('/api/pools/draft', {
        method: 'POST',
        body: JSON.stringify({ poolId, action }),
      })
      toast.success(
        action === 'create' ? 'Draft created' : action === 'sync' ? 'Rosters updated' : 'Done'
      )
      await refetch()
      if (action === 'create') window.location.reload()
      return r
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const pick = async (itemId: string) => {
    setBusy(true)
    try {
      await hubFetch(`/${draftId}/pick`, { method: 'POST', body: JSON.stringify({ itemId }) })
      await refetch()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const queue = state?.myQueue ?? []
  const queuedSet = new Set(queue)

  const saveQueue = async (itemIds: string[]) => {
    try {
      await hubFetch(`/${draftId}/queue`, {
        method: 'POST',
        body: JSON.stringify({ itemIds }),
      })
      await refetch()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const toggleQueued = (itemId: string) =>
    saveQueue(queuedSet.has(itemId) ? queue.filter((q) => q !== itemId) : [...queue, itemId])

  const moveQueued = (index: number, delta: number) => {
    const next = [...queue]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    void saveQueue(next)
  }

  const setAutodraft = async (enabled: boolean) => {
    try {
      await hubFetch(`/${draftId}/queue`, {
        method: 'POST',
        body: JSON.stringify({ autodraft: enabled }),
      })
      toast.success(enabled ? 'Autodraft on' : 'Autodraft off')
      await refetch()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  if (!pool) return <LoadingSpinner />

  if (pool.pickMode !== 'draft') {
    return (
      <Centered>
        <p className="mb-3">This pool is a pick’em, not a draft.</p>
        <Link to={`/pools/${poolId}`} className="text-sm" style={{ color: 'var(--color-green-primary)' }}>
          ← Back to pool
        </Link>
      </Centered>
    )
  }

  if (!draftId) {
    return (
      <Centered>
        <h1 className="font-display text-3xl mb-2" style={{ color: 'var(--color-text-primary)' }}>
          DRAFT
        </h1>
        <p className="text-sm mb-5" style={{ color: 'var(--color-text-secondary)' }}>
          {isOwner
            ? 'Create the draft once everyone has joined. Draft order follows join order and can be changed before you start.'
            : 'The pool owner hasn’t created the draft yet.'}
        </p>
        {isOwner && (
          <button
            onClick={() => poolAction('create')}
            disabled={busy}
            className="px-5 py-2.5 rounded-lg font-medium text-sm disabled:opacity-50"
            style={{ background: 'var(--color-green-primary)', color: '#000' }}
          >
            {busy ? 'Creating…' : 'Create draft'}
          </button>
        )}
      </Centered>
    )
  }

  if (!state) return <LoadingSpinner />

  const { draft } = state

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-5">
        <Link to={`/pools/${poolId}`} className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          ← {pool.name}
        </Link>
        <h1 className="font-display text-3xl mt-1" style={{ color: 'var(--color-text-primary)' }}>
          DRAFT
        </h1>
      </div>

      {/* Status bar */}
      <div
        className="rounded-xl border p-4 mb-5 flex flex-wrap items-center justify-between gap-3"
        style={{
          background: state.isMyTurn ? 'var(--color-green-dim)' : 'var(--color-surface)',
          borderColor: state.isMyTurn ? 'var(--color-green-primary)' : 'var(--color-border)',
        }}
      >
        <div>
          {draft.status === 'setup' && (
            <span style={{ color: 'var(--color-text-secondary)' }}>
              Ready to start · {state.participants.length} teams · {draft.rounds} rounds
            </span>
          )}
          {draft.status === 'active' && (
            <>
              <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                Round {state.current?.round} · Pick {state.current?.pickInRound}
              </div>
              <div className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                {state.isMyTurn ? "You're on the clock" : `${state.onTheClock?.teamName ?? '—'} is picking`}
              </div>
            </>
          )}
          {draft.status === 'paused' && <span style={{ color: 'var(--color-score-bogey)' }}>Paused</span>}
          {draft.status === 'complete' && (
            <span style={{ color: 'var(--color-green-primary)' }}>Draft complete</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {draft.status === 'active' && countdown && (
            <span className="font-mono text-xl" style={{ color: 'var(--color-text-primary)' }}>
              {countdown}
            </span>
          )}
          {isOwner && draft.status === 'setup' && (
            <button
              onClick={() => poolAction('start')}
              disabled={busy}
              className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ background: 'var(--color-green-primary)', color: '#000' }}
            >
              Start draft
            </button>
          )}
          {isOwner && draft.status === 'active' && (
            <button
              onClick={() => poolAction('pause')}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg text-xs border"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              Pause
            </button>
          )}
          {isOwner && draft.status === 'paused' && (
            <button
              onClick={() => poolAction('resume')}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg text-xs"
              style={{ background: 'var(--color-green-primary)', color: '#000' }}
            >
              Resume
            </button>
          )}
          {isOwner && draft.status !== 'setup' && (
            <button
              onClick={() => {
                if (
                  window.confirm(
                    'Restart the draft? Every pick is cleared and the board is rebuilt with current settings.'
                  )
                ) {
                  void poolAction('restart').then(() => window.location.reload())
                }
              }}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg text-xs border"
              style={{ borderColor: 'var(--color-score-bogey)', color: 'var(--color-score-bogey)' }}
            >
              Restart
            </button>
          )}
          {isOwner && draft.status === 'complete' && (
            <button
              onClick={() => poolAction('sync')}
              disabled={busy}
              className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ background: 'var(--color-green-primary)', color: '#000' }}
            >
              Save rosters
            </button>
          )}
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="flex gap-2 mb-4 lg:hidden">
        {([
          ['draft', 'Draft'],
          ['queue', `Queue (${queue.length})`],
          ['team', `Team (${myPicks.length}/${draft.rounds})`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMobileTab(key)}
            className="flex-1 py-2 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: mobileTab === key ? 'var(--color-green-primary)' : 'var(--color-surface)',
              color: mobileTab === key ? '#000' : 'var(--color-text-secondary)',
              border: mobileTab === key ? 'none' : '1px solid var(--color-border)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-5">
        {/* Available golfers */}
        <div className={mobileTab === 'draft' ? '' : 'hidden lg:block'}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search golfers…"
            className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none mb-3"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
          />
          <div className="grid gap-1.5 max-h-[65vh] overflow-y-auto pr-1">
            {filtered.map((item) => {
              const meta = (item.meta ?? {}) as Record<string, any>
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg border"
                  style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                      {item.name}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {item.rankHint ? `#${item.rankHint} WR` : 'Unranked'}
                      {meta.teeTime ? ` · ⛳ ${meta.teeTime}` : ''}
                      {meta.seasonStats?.avgFpts != null ? ` · ${meta.seasonStats.avgFpts} avg` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleQueued(item.id)}
                    className="px-2 py-1.5 rounded-lg text-xs font-medium border"
                    style={{
                      borderColor: queuedSet.has(item.id)
                        ? 'var(--color-green-primary)'
                        : 'var(--color-border)',
                      color: queuedSet.has(item.id)
                        ? 'var(--color-green-primary)'
                        : 'var(--color-text-muted)',
                    }}
                    title={queuedSet.has(item.id) ? 'Remove from queue' : 'Add to queue'}
                  >
                    {queuedSet.has(item.id) ? `#${queue.indexOf(item.id) + 1}` : '+ Queue'}
                  </button>
                  <button
                    onClick={() => pick(item.id)}
                    disabled={busy || !state.isMyTurn || draft.status !== 'active'}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-30"
                    style={{ background: 'var(--color-green-primary)', color: '#000' }}
                  >
                    Draft
                  </button>
                </div>
              )
            })}
            {filtered.length === 0 && (
              <p className="text-sm p-3" style={{ color: 'var(--color-text-muted)' }}>
                No golfers match.
              </p>
            )}
          </div>
        </div>

        {/* Queue, team and recent picks */}
        <div className={`space-y-4 ${mobileTab === 'draft' ? 'hidden lg:block' : ''}`}>
          <div className={`rounded-xl border p-3 ${mobileTab === 'team' ? 'hidden lg:block' : ''}`} style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
                My queue ({queue.length})
              </h3>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={!!state.myAutodraft}
                  onChange={(e) => setAutodraft(e.target.checked)}
                  className="rounded"
                />
                Autodraft
              </label>
            </div>
            {queue.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Queue golfers and they'll be taken in this order when it's your pick — even if
                you're away.
              </p>
            ) : (
              <ol className="space-y-1">
                {queue.map((itemId, i) => {
                  const item =
                    state.available.find((a) => a.id === itemId) ??
                    state.board.find((b) => b.item?.id === itemId)?.item
                  const gone = !state.available.some((a) => a.id === itemId)
                  return (
                    <li key={itemId} className="flex items-center gap-1.5 text-xs">
                      <span className="font-mono w-4" style={{ color: 'var(--color-text-muted)' }}>
                        {i + 1}
                      </span>
                      <span
                        className="flex-1 truncate"
                        style={{
                          color: gone ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                          textDecoration: gone ? 'line-through' : 'none',
                        }}
                      >
                        {item?.name ?? 'Unknown'}
                      </span>
                      <button onClick={() => moveQueued(i, -1)} disabled={i === 0}
                        className="px-1 disabled:opacity-20" style={{ color: 'var(--color-text-muted)' }}>↑</button>
                      <button onClick={() => moveQueued(i, 1)} disabled={i === queue.length - 1}
                        className="px-1 disabled:opacity-20" style={{ color: 'var(--color-text-muted)' }}>↓</button>
                      <button onClick={() => toggleQueued(itemId)} className="px-1"
                        style={{ color: 'var(--color-score-bogey)' }}>×</button>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>

          <div className={`rounded-xl border p-3 ${mobileTab === 'queue' ? 'hidden lg:block' : ''}`} style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
            <h3 className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-muted)' }}>
              My team ({myPicks.length}/{draft.rounds})
            </h3>
            {myPicks.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No picks yet.</p>
            ) : (
              <ol className="space-y-1">
                {myPicks.map((p) => (
                  <li key={p.overall} className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                    <span className="font-mono text-xs mr-2" style={{ color: 'var(--color-text-muted)' }}>
                      R{p.round}
                    </span>
                    {p.item?.name}
                    {p.isAuto && (
                      <span className="text-[10px] ml-1" style={{ color: 'var(--color-score-bogey)' }}>auto</span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="rounded-xl border p-3" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
            <h3 className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-muted)' }}>
              Recent picks
            </h3>
            <ol className="space-y-1">
              {state.board
                .filter((b) => b.item)
                .slice(-12)
                .reverse()
                .map((b) => (
                  <li key={b.overall} className="text-xs flex gap-2">
                    <span className="font-mono w-10 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                      {b.round}.{b.pickInRound}
                    </span>
                    <span className="flex-1 truncate" style={{ color: 'var(--color-text-primary)' }}>
                      {b.item?.name}
                    </span>
                    <span className="truncate max-w-[90px]" style={{ color: 'var(--color-text-muted)' }}>
                      {teamById.get(b.participantId)?.teamName}
                    </span>
                  </li>
                ))}
              {state.board.every((b) => !b.item) && (
                <li className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  No picks yet.
                </li>
              )}
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="max-w-2xl mx-auto px-4 py-16 text-center text-gray-300">{children}</div>
}
