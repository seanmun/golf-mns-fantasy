import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ChevronRight } from 'lucide-react'

export function Players() {
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['all-golfers'],
    queryFn: async () => {
      const res = await fetch('/api/golfers')
      if (!res.ok) throw new Error('Failed to load golfers')
      return res.json()
    },
  })

  if (isLoading) return <LoadingSpinner />

  const golfers = (data?.golfers || []).filter((g: any) =>
    !search || g.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="font-display text-4xl" style={{ color: 'var(--color-text-primary)' }}>PLAYER POOL</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          {golfers.length} golfers available · Ranked by world ranking · Tap for stats
        </p>
      </div>

      <input
        type="text"
        placeholder="Search golfers..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none mb-6"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
      />

      <div className="grid sm:grid-cols-2 gap-2">
        {golfers.map((golfer: any) => (
          <Link
            key={golfer.id}
            to={`/players/${golfer.id}`}
            className="flex items-center gap-3 p-3 rounded-lg border hover:border-[var(--color-green-primary)] transition-colors"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
          >
            {golfer.photoUrl && (
              <img
                src={golfer.photoUrl}
                alt={golfer.name}
                className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>
                {golfer.name}
              </div>
              <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {golfer.country || 'Unknown'}{golfer.worldRanking ? ` · #${golfer.worldRanking} World Ranking` : ''}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {golfer.worldRanking && (
                <div className="text-right">
                  <div className="font-mono font-bold text-lg" style={{ color: 'var(--color-green-primary)' }}>
                    #{golfer.worldRanking}
                  </div>
                </div>
              )}
              <ChevronRight size={14} style={{ color: 'var(--color-text-muted)' }} />
            </div>
          </Link>
        ))}
      </div>

      {golfers.length === 0 && (
        <div className="text-center py-20">
          <p style={{ color: 'var(--color-text-muted)' }}>
            {search ? 'No golfers match your search.' : 'No golfers available yet. Admin needs to sync from sportsdata.io.'}
          </p>
        </div>
      )}
    </div>
  )
}
