interface ScoreBadgeProps {
  score: number | null
  label?: string
}

export function ScoreBadge({ score, label }: ScoreBadgeProps) {
  if (score === null) return <span style={{ color: 'var(--color-text-muted)' }}>-</span>

  const getColor = () => {
    if (score >= 8) return 'var(--color-gold)'
    if (score === 8) return 'var(--color-score-eagle)'
    if (score >= 3) return 'var(--color-score-birdie)'
    if (score === 0) return 'var(--color-score-par)'
    if (score === -1) return 'var(--color-score-bogey)'
    return 'var(--color-score-double)'
  }

  const display = label ?? (score > 0 ? `+${score}` : score === 0 ? 'E' : `${score}`)

  return (
    <span
      className="font-mono text-sm font-medium tabular-nums"
      style={{ color: getColor() }}
    >
      {display}
    </span>
  )
}
