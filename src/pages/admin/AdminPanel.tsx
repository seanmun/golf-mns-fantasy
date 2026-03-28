import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useApi } from '@/lib/api/client'
import { toast } from 'sonner'

export function AdminPanel() {
  const { apiFetch } = useApi()
  const [recalcPoolId, setRecalcPoolId] = useState('')
  const [recalculating, setRecalculating] = useState(false)
  const [scoreJson, setScoreJson] = useState('')
  const [uploadTournamentId, setUploadTournamentId] = useState('')
  const [uploading, setUploading] = useState(false)

  const { data: tournamentsData } = useQuery({
    queryKey: ['tournaments'],
    queryFn: async () => {
      const res = await fetch('/api/tournaments')
      return res.json()
    },
  })

  const { data: poolsData } = useQuery({
    queryKey: ['pools-all'],
    queryFn: async () => {
      const res = await fetch('/api/pools')
      return res.json()
    },
  })

  async function handleRecalculate() {
    if (!recalcPoolId) { toast.error('Select a pool'); return }
    setRecalculating(true)
    try {
      const { updatedEntries } = await apiFetch<any>('/api/scoring/recalculate', {
        method: 'POST',
        body: JSON.stringify({ poolId: recalcPoolId }),
      })
      toast.success(`Recalculated ${updatedEntries} entries`)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setRecalculating(false)
    }
  }

  async function handleScoreUpload() {
    if (!uploadTournamentId) { toast.error('Select a tournament'); return }
    let scores
    try {
      scores = JSON.parse(scoreJson)
    } catch {
      toast.error('Invalid JSON')
      return
    }
    setUploading(true)
    try {
      const { upserted } = await apiFetch<any>('/api/admin/scores', {
        method: 'POST',
        body: JSON.stringify({ tournamentId: uploadTournamentId, scores }),
      })
      toast.success(`Uploaded scores for ${upserted} golfers`)
      setScoreJson('')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setUploading(false)
    }
  }

  const tournaments = tournamentsData?.tournaments || []
  const pools = poolsData?.pools || []

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="font-display text-4xl mb-8" style={{ color: 'var(--color-text-primary)' }}>ADMIN</h1>

      {/* Score Upload */}
      <section className="mb-10 p-6 rounded-xl border" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
        <h2 className="font-display text-xl mb-4" style={{ color: 'var(--color-text-primary)' }}>UPLOAD SCORES</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
          Paste a JSON array of golfer results for a tournament round.
        </p>

        <select value={uploadTournamentId} onChange={(e) => setUploadTournamentId(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none mb-3"
          style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}>
          <option value="">Select tournament</option>
          {tournaments.map((t: any) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <textarea
          value={scoreJson}
          onChange={(e) => setScoreJson(e.target.value)}
          rows={8}
          placeholder={`[\n  {\n    "golferId": "uuid",\n    "birdies": 5,\n    "eagles": 1,\n    "pars": 30,\n    "bogeys": 3,\n    "doubleBogeys": 0,\n    "worseThanDouble": 0,\n    "holeInOnes": 0,\n    "albatrosses": 0,\n    "isCut": false,\n    "position": 1,\n    "totalScore": -7\n  }\n]`}
          className="w-full px-3 py-2.5 rounded-lg border text-xs font-mono outline-none resize-none mb-3"
          style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
        />

        <button onClick={handleScoreUpload} disabled={uploading}
          className="px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
          style={{ background: 'var(--color-green-primary)', color: '#000' }}>
          {uploading ? 'Uploading...' : 'Upload Scores'}
        </button>
      </section>

      {/* Recalculate */}
      <section className="p-6 rounded-xl border" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
        <h2 className="font-display text-xl mb-4" style={{ color: 'var(--color-text-primary)' }}>RECALCULATE POINTS</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
          Recompute all entry totals and rankings for a pool.
        </p>

        <select value={recalcPoolId} onChange={(e) => setRecalcPoolId(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none mb-3"
          style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}>
          <option value="">Select pool</option>
          {pools.map((p: any) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <button onClick={handleRecalculate} disabled={recalculating}
          className="px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
          style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>
          {recalculating ? 'Recalculating...' : 'Recalculate'}
        </button>
      </section>
    </div>
  )
}
