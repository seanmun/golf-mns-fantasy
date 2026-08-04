import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ScoreBadge } from '@/components/shared/ScoreBadge'
import { ChevronLeft } from 'lucide-react'
import {
  calculateGolferPoints,
  pointsFromHoles,
  DEFAULT_SCORING,
  type ScoringConfig,
} from '@/lib/scoring/engine'

// Scores refresh hourly while play is under way at the venue
// (6am–11pm local, see api/cron/sync-all.ts).
function syncStatusLine(tournament: any): string | null {
  if (!tournament?.lastSyncedAt) return null
  const tz = tournament.timeZone || 'America/New_York'
  const last = new Date(tournament.lastSyncedAt).toLocaleTimeString('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
  const lastText = `Scores updated ${last}`

  if (tournament.status === 'completed') return `${lastText} · final`

  const localHour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, hour: '2-digit' }).format(
      new Date()
    )
  ) % 24
  return localHour >= 6 && localHour <= 23
    ? `${lastText} · updates hourly during play`
    : `${lastText} · next update after 6am at the course`
}

// Per-pool scoring key. Reads the pool's own config so custom scoring
// stays accurate.
function ScoringLegend({ config }: { config: ScoringConfig }) {
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`)
  const holes: Array<[string, number, ScoreKind]> = [
    ['Ace', config.hole_in_one, 'ace'],
    ['Albatross', config.albatross, 'albatross'],
    ['Eagle', config.eagle, 'eagle'],
    ['Birdie', config.birdie, 'birdie'],
    ['Par', config.par, 'par'],
    ['Bogey', config.bogey, 'bogey'],
    ['Double', config.double_bogey, 'double'],
    ['Worse', config.worse_than_double, 'worse'],
  ]
  const podium = Object.entries(config.position_bonuses ?? {})
    .map(([pos, pts]) => [Number(pos), Number(pts)] as [number, number])
    .sort((a, b) => a[0] - b[0])

  return (
    <details className="mb-4 rounded-lg border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
      <summary className="cursor-pointer px-4 py-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
        Scoring
      </summary>
      <div className="px-4 pb-3 pt-1">
        <div className="flex flex-wrap gap-1.5">
          {holes.map(([label, pts, kind]) => (
            <span
              key={label}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs"
              style={{
                background: 'var(--color-surface-2)',
                color: SCORE_STYLE[kind].color,
                fontWeight: SCORE_STYLE[kind].weight,
              }}
            >
              {label}
              <span className="font-mono">{sign(pts)}</span>
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Made cut{' '}
          <span className="font-mono" style={{ color: 'var(--color-green-primary)' }}>
            {sign(config.made_cut_bonus)}
          </span>
          {podium.length > 0 && (
            <>
              {' · Finish '}
              {podium.map(([pos, pts], i) => (
                <span key={pos}>
                  {i > 0 && ', '}
                  {pos === 1 ? 'win' : `${pos}${pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th'}`}{' '}
                  <span className="font-mono" style={{ color: 'var(--color-green-primary)' }}>
                    {sign(pts)}
                  </span>
                </span>
              ))}
            </>
          )}
        </p>
        <p className="mt-1.5 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          Every golfer on your team scores; round columns show hole points only, the total adds cut and finish bonuses.
        </p>
      </div>
    </details>
  )
}

// Team fantasy points per round, summed from stored hole-by-hole data.
function roundPoints(entry: any, config: ScoringConfig): Record<number, number> {
  const totals: Record<number, number> = {}
  for (const { results } of entry.golfers ?? []) {
    for (const r of results?.scorecards ?? []) {
      const pts = pointsFromHoles(Object.values(r.holes ?? {}), config)
      totals[r.round] = Math.round(((totals[r.round] ?? 0) + pts) * 100) / 100
    }
  }
  return totals
}

function golferPoints(results: any, config: ScoringConfig): number {
  return calculateGolferPoints(
    {
      hole_in_ones: results.holeInOnes,
      albatrosses: results.albatrosses,
      eagles: results.eagles,
      birdies: results.birdies,
      pars: results.pars,
      bogeys: results.bogeys,
      double_bogeys: results.doubleBogeys,
      worse_than_double: results.worseThanDouble,
      is_cut: results.isCut,
      position: results.position,
    },
    config
  )
}

// One palette for every score reference in the app — the legend teaches
// the same colors used in the hole-by-hole cells.
type ScoreKind =
  | 'ace'
  | 'albatross'
  | 'eagle'
  | 'birdie'
  | 'par'
  | 'bogey'
  | 'double'
  | 'worse'

// A distinct color per tier, running best -> worst:
// purple, cyan, blue, green, grey, yellow, orange, red.
const SCORE_STYLE: Record<ScoreKind, { color: string; weight: number }> = {
  ace: { color: '#bf5af2', weight: 700 },
  albatross: { color: '#00e5ff', weight: 700 },
  eagle: { color: '#3b82f6', weight: 700 },
  birdie: { color: '#00ff87', weight: 700 },
  par: { color: '#8e8e9a', weight: 400 },
  bogey: { color: '#ffd60a', weight: 600 },
  double: { color: '#ff9f0a', weight: 700 },
  worse: { color: '#ff453a', weight: 700 },
}

function kindOf(score: number, par: number): ScoreKind {
  if (score === 1) return 'ace'
  const diff = score - par
  if (diff <= -3) return 'albatross'
  if (diff === -2) return 'eagle'
  if (diff === -1) return 'birdie'
  if (diff === 0) return 'par'
  if (diff === 1) return 'bogey'
  if (diff === 2) return 'double'
  return 'worse'
}

function holeColor(score: number, par: number) {
  return SCORE_STYLE[kindOf(score, par)]
}

// Every point a golfer earned, attributed: hole scoring per round, plus
// the tournament-level bonuses (made cut, finish position).
function PointsBreakdown({ results, config }: { results: any; config: ScoringConfig }) {
  const rounds: Array<{ round: number; holes: Record<string, { score: number; par: number }> }> =
    results?.scorecards ?? []
  const perRound = rounds.map((r) => ({
    round: r.round,
    pts: pointsFromHoles(Object.values(r.holes ?? {}), config),
  }))
  const holeTotal = perRound.reduce((s, r) => s + r.pts, 0)
  const cutBonus = results && !results.isCut ? config.made_cut_bonus : 0
  const finishBonus =
    results?.position != null ? (config.position_bonuses?.[String(results.position)] ?? 0) : 0
  const total = Math.round((holeTotal + cutBonus + finishBonus) * 100) / 100
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`)

  const rows: Array<[string, number]> = [
    ...perRound.map((r) => [`Round ${r.round}`, r.pts] as [string, number]),
    ...(cutBonus ? ([['Made cut', cutBonus]] as Array<[string, number]>) : []),
    ...(finishBonus
      ? ([[`Finished ${results.position === 1 ? '1st' : `${results.position}`}`, finishBonus]] as Array<[string, number]>)
      : []),
  ]

  if (rows.length === 0) return null

  return (
    <div className="mt-2 rounded-lg p-3" style={{ background: 'var(--color-surface)' }}>
      <div className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
        Points
      </div>
      <div className="space-y-0.5">
        {rows.map(([label, pts]) => (
          <div key={label} className="flex justify-between text-xs">
            <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
            <span className="font-mono" style={{ color: 'var(--color-text-primary)' }}>{sign(pts)}</span>
          </div>
        ))}
        <div className="flex justify-between text-xs pt-1 mt-1" style={{ borderTop: '1px solid var(--color-border)' }}>
          <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>Total</span>
          <span className="font-mono font-bold" style={{ color: 'var(--color-green-primary)' }}>{total}</span>
        </div>
      </div>
    </div>
  )
}

function ScorecardPanel({ scorecards }: { scorecards: Array<{ round: number; holes: Record<string, { score: number; par: number }>; strokes: number }> }) {
  return (
    <div className="mt-2 space-y-2">
      {scorecards.map((r) => {
        const holeNums = Object.keys(r.holes).map(Number).sort((a, b) => a - b)
        const parTotal = holeNums.reduce((s, n) => s + r.holes[String(n)].par, 0)
        return (
          <div key={r.round} className="rounded-lg p-2 overflow-x-auto" style={{ background: 'var(--color-surface)' }}>
            <div className="flex items-center justify-between mb-1 px-1">
              <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
                Round {r.round}
              </span>
              <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                {r.strokes} ({r.strokes - parTotal >= 0 ? '+' : ''}{r.strokes - parTotal})
              </span>
            </div>
            <div className="flex gap-0.5 min-w-max px-1">
              {holeNums.map((n) => {
                const h = r.holes[String(n)]
                const c = holeColor(h.score, h.par)
                return (
                  <div key={n} className="w-6 text-center">
                    <div className="text-[8px]" style={{ color: 'var(--color-text-muted)' }}>{n}</div>
                    <div className="text-[11px] font-mono rounded" style={{ color: c.color, fontWeight: c.weight }}>
                      {h.score}
                    </div>
                    <div className="text-[8px]" style={{ color: 'var(--color-text-muted)' }}>p{h.par}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function PoolLeaderboard() {
  const { poolId } = useParams<{ poolId: string }>()
  const { user } = useUser()
  const [openGolfer, setOpenGolfer] = useState<string | null>(null)
  const [openEntry, setOpenEntry] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard', poolId],
    queryFn: async () => {
      const res = await fetch(`/api/pools/leaderboard?poolId=${poolId}`)
      if (!res.ok) throw new Error('Failed to load leaderboard')
      const json = await res.json()
      // Fire-and-forget: nudge the live score sync. Server-side throttle
      // means this only hits sportsdata every few minutes no matter how
      // many viewers are on the page.
      if (json?.pool?.tournamentId) {
        void fetch('/api/scoring/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tournamentId: json.pool.tournamentId }),
        }).catch(() => {})
      }
      return json
    },
    refetchInterval: 60_000, // refresh every minute during active tournament
  })

  if (isLoading) return <LoadingSpinner />

  const { leaderboard = [], pool, tournament } = data || {}
  const syncLine = syncStatusLine(tournament)

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-8">
        <Link to={`/pools/${poolId}`} className="inline-flex items-center gap-1 text-sm mb-4"
          style={{ color: 'var(--color-text-muted)' }}>
          <ChevronLeft size={14} /> Back to pool
        </Link>
        <h1 className="font-display text-4xl" style={{ color: 'var(--color-text-primary)' }}>
          LEADERBOARD
        </h1>
        {pool && (
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            {pool.name} · {leaderboard.length} entries
          </p>
        )}
      </div>

      <ScoringLegend config={pool?.scoringConfig ?? DEFAULT_SCORING} />

      {leaderboard.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No entries yet.</p>
      ) : (
        <div className="space-y-2">
          {leaderboard.map((entry: any, idx: number) => {
            const isMe = user?.id === entry.userId
            return (
              <div
                key={entry.id}
                className="rounded-xl border p-4"
                style={{
                  background: isMe ? 'var(--color-green-dim)' : 'var(--color-surface)',
                  borderColor: isMe ? 'var(--color-green-muted)' : 'var(--color-border)',
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-lg font-bold w-8 text-center"
                      style={{ color: idx === 0 ? 'var(--color-gold)' : 'var(--color-text-muted)' }}>
                      #{entry.rank || idx + 1}
                    </span>
                    <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      {entry.displayName} {isMe && <span className="text-xs" style={{ color: 'var(--color-green-primary)' }}>(you)</span>}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-lg" style={{ color: 'var(--color-green-primary)' }}>
                    {Number(entry.totalPoints).toFixed(0)} pts
                  </span>
                </div>

                {/* Per-round team fantasy points (hole scoring; total also
                    includes cut/position bonuses) */}
                {(() => {
                  const rp = roundPoints(entry, pool?.scoringConfig ?? DEFAULT_SCORING)
                  const roundsPresent = [1, 2, 3, 4].filter((r) => rp[r] !== undefined)
                  if (roundsPresent.length === 0) return null
                  return (
                    <div className="flex gap-2 mb-3">
                      {[1, 2, 3, 4].map((r) => (
                        <div key={r} className="flex-1 text-center py-1.5 rounded-lg" style={{ background: 'var(--color-surface-2)' }}>
                          <div className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Rd {r}</div>
                          <div className="text-sm font-mono font-bold" style={{ color: rp[r] !== undefined ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                            {rp[r] !== undefined ? rp[r] : '—'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}

                {/* Players dropdown */}
                <button
                  onClick={() => setOpenEntry(openEntry === entry.id ? null : entry.id)}
                  className="w-full py-1.5 rounded-lg text-xs font-medium mb-2 transition-colors"
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {openEntry === entry.id ? 'Hide players ▴' : 'View players ▾'}
                </button>

                {/* Golfer breakdown — tap a golfer for hole-by-hole */}
                {openEntry === entry.id && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {entry.golfers.map(({ golfer, results }: any) => {
                    const key = `${entry.id}:${golfer?.id}`
                    const isOpen = openGolfer === key
                    const hasHoles = !!results?.scorecards?.length
                    return (
                      <div key={golfer?.id || Math.random()} className={isOpen ? 'col-span-2 sm:col-span-3' : ''}>
                        <button
                          onClick={() => setOpenGolfer(isOpen ? null : key)}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors"
                          style={{
                            background: 'var(--color-surface-2)',
                            outline: isOpen ? '1px solid var(--color-green-muted)' : 'none',
                          }}
                        >
                          <span className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
                            {golfer?.name || 'Unknown'}
                          </span>
                          {results ? (
                            <ScoreBadge score={golferPoints(results, pool?.scoringConfig ?? DEFAULT_SCORING)} />
                          ) : (
                            <span className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>-</span>
                          )}
                        </button>
                        {isOpen && (
                          <>
                            <PointsBreakdown
                              results={results}
                              config={pool?.scoringConfig ?? DEFAULT_SCORING}
                            />
                            {hasHoles ? (
                              <ScorecardPanel scorecards={results.scorecards} />
                            ) : (
                              <p className="mt-2 px-3 py-2 rounded-lg text-[11px]" style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)' }}>
                                Hole-by-hole appears after the next stats sync.
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {syncLine && (
        <p className="mt-6 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {syncLine}
        </p>
      )}
    </div>
  )
}
