import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

// A waiver window is a DEADLINE. It goes at the top of whatever page the
// user actually landed on, says what is at stake and when it ends, and
// is the whole element that links — not a grey button in a nav row.
export function WaiverBanner({ poolId, w }: { poolId: string; w: any }) {
  if (!w?.isOpen) return null
  return (
    <Link
      to={`/pools/${poolId}/waivers`}
      className="block rounded-xl border-2 p-4 mb-6 transition-opacity hover:opacity-90"
      style={{ background: 'var(--color-green-dim)', borderColor: 'var(--color-green-primary)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide mb-1"
            style={{ color: 'var(--color-green-primary)' }}>
            Waivers open · {w.tournamentName}
          </div>
          <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
            {w.deadOnMyRoster > 0
              ? `${w.deadOnMyRoster} of your ${w.myRosterSize} golfers aren't in the field — they score nothing.`
              : 'Make a move before the next event.'}
          </div>
          {w.processAt && (
            <div className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              <Countdown to={w.processAt} />
            </div>
          )}
        </div>
        <ChevronRight size={18} style={{ color: 'var(--color-green-primary)', flexShrink: 0 }} />
      </div>
    </Link>
  )
}

// "Closes in 8h" lands; a date string does not.
export function Countdown({ to }: { to: string }) {
  const ms = new Date(to).getTime() - Date.now()
  const when = new Date(to).toLocaleString('en-US', {
    weekday: 'short', hour: 'numeric', minute: '2-digit',
  })
  if (ms <= 0) return <>Closed</>
  const hours = Math.floor(ms / 3600000)
  if (hours < 1) return <>Closes in {Math.max(1, Math.floor(ms / 60000))} min · {when}</>
  if (hours < 48) return <>Closes in {hours}h · {when}</>
  return <>Closes {when}</>
}
