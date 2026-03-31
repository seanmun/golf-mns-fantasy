import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useApi } from '@/lib/api/client'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

export function PoolManage() {
  const { poolId } = useParams<{ poolId: string }>()
  const navigate = useNavigate()
  const { apiFetch } = useApi()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [rosterSize, setRosterSize] = useState(6)
  const [isPublic, setIsPublic] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['pool-manage', poolId],
    queryFn: async () => {
      const data = await apiFetch(`/api/pools/${poolId}`) as { pool: any }
      if (!loaded) {
        setName(data.pool.name)
        setDescription(data.pool.description || '')
        setRosterSize(data.pool.rosterSize)
        setIsPublic(data.pool.isPublic)
        setLoaded(true)
      }
      return data
    },
  })

  if (isLoading) return <LoadingSpinner />
  if (!data) return null

  const pool = data.pool

  async function handleSave() {
    setSaving(true)
    try {
      await apiFetch(`/api/pools/${poolId}`, {
        method: 'PUT',
        body: JSON.stringify({ name, description, rosterSize, isPublic }),
      })
      toast.success('Pool updated')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    try {
      await apiFetch(`/api/pools/${poolId}`, { method: 'DELETE' })
      toast.success('Pool deleted')
      navigate('/pools')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <Link
        to={`/pools/${poolId}`}
        className="inline-flex items-center gap-1.5 text-sm mb-6 hover:text-neon-green transition-colors"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <ArrowLeft size={14} /> Back to Pool
      </Link>

      <h1 className="font-display text-4xl mb-8" style={{ color: 'var(--color-text-primary)' }}>MANAGE POOL</h1>

      {/* Pool Settings */}
      <section className="rounded-xl border p-6 mb-6" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
        <h2 className="font-display text-lg mb-4" style={{ color: 'var(--color-text-primary)' }}>SETTINGS</h2>

        <div className="space-y-4">
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Pool Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
              style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            />
          </div>

          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional description for your pool"
              className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none resize-none"
              style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Roster Size</label>
              <input
                type="number"
                min={1}
                max={20}
                value={rosterSize}
                onChange={(e) => setRosterSize(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
                style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              />
            </div>

            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Visibility</label>
              <select
                value={isPublic ? 'public' : 'private'}
                onChange={(e) => setIsPublic(e.target.value === 'public')}
                className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
                style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              >
                <option value="public">Public</option>
                <option value="private">Private (invite only)</option>
              </select>
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="mt-6 px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
          style={{ background: 'var(--color-green-primary)', color: '#000' }}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </section>

      {/* Pool Info */}
      <section className="rounded-xl border p-6 mb-6" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
        <h2 className="font-display text-lg mb-4" style={{ color: 'var(--color-text-primary)' }}>POOL INFO</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span style={{ color: 'var(--color-text-muted)' }}>Tournament</span>
            <span style={{ color: 'var(--color-text-primary)' }}>{pool.tournamentName}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--color-text-muted)' }}>Join Code</span>
            <span className="font-mono font-bold" style={{ color: 'var(--color-text-primary)' }}>{pool.joinCode}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--color-text-muted)' }}>Status</span>
            <span style={{ color: pool.status === 'open' ? 'var(--color-green-primary)' : 'var(--color-text-muted)' }}>
              {pool.status.toUpperCase()}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--color-text-muted)' }}>Created</span>
            <span style={{ color: 'var(--color-text-primary)' }}>
              {new Date(pool.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="rounded-xl border p-6" style={{ background: 'var(--color-surface)', borderColor: '#ef4444' }}>
        <h2 className="font-display text-lg mb-2" style={{ color: '#ef4444' }}>DANGER ZONE</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
          Deleting a pool removes all entries and cannot be undone.
        </p>
        {confirmDelete ? (
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{ color: '#ef4444' }}>Are you sure?</span>
            <button
              onClick={handleDelete}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: '#ef4444', color: '#fff' }}
            >
              Yes, delete permanently
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-4 py-2 rounded-lg text-sm border"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm border"
            style={{ borderColor: '#ef4444', color: '#ef4444' }}
          >
            <Trash2 size={13} /> Delete Pool
          </button>
        )}
      </section>
    </div>
  )
}
