import { useEffect, useRef } from 'react'
import { useAuth } from '@clerk/clerk-react'

export function useUserSync() {
  const { isSignedIn, getToken } = useAuth()
  const synced = useRef(false)

  useEffect(() => {
    if (!isSignedIn || synced.current) return
    synced.current = true

    getToken().then((token) => {
      if (!token) return
      fetch('/api/users/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }).catch(console.error)
    })
  }, [isSignedIn, getToken])
}
