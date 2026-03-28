import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApi } from '@/lib/api/client'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { toast } from 'sonner'

export function PoolJoin() {
  const { joinCode } = useParams<{ joinCode: string }>()
  const navigate = useNavigate()
  const { apiFetch } = useApi()
  const [status, setStatus] = useState<'joining' | 'error'>('joining')

  useEffect(() => {
    if (!joinCode) return
    apiFetch<{ pool: any; entry: any; alreadyJoined?: boolean }>('/api/pools/join', {
      method: 'POST',
      body: JSON.stringify({ joinCode }),
    })
      .then(({ pool, alreadyJoined }) => {
        if (alreadyJoined) toast.info('Already in this pool')
        else toast.success('Joined pool!')
        navigate(`/pools/${pool.id}`)
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to join pool')
        setStatus('error')
      })
  }, [joinCode, apiFetch, navigate])

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <p className="text-lg mb-4" style={{ color: 'var(--color-text-primary)' }}>Invalid or expired join code</p>
        <button onClick={() => navigate('/pools')} className="px-4 py-2 rounded-lg text-sm"
          style={{ background: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
          Browse Pools
        </button>
      </div>
    )
  }

  return <LoadingSpinner />
}
