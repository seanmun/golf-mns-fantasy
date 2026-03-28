import { Link } from 'react-router-dom'
import { SignedIn, SignedOut, UserButton, useAuth } from '@clerk/clerk-react'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'

function AdminNav() {
  const { getToken } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    async function check() {
      try {
        const token = await getToken()
        if (!token) return
        const res = await fetch('/api/admin/check', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setIsAdmin(data.isAdmin)
        }
      } catch {}
    }
    check()
  }, [getToken])

  if (!isAdmin) return null
  return <Link to="/admin" className="hover:text-[var(--color-foreground)] transition-colors">Admin</Link>
}

export function Header() {
  const platformUrl = import.meta.env.VITE_PLATFORM_URL || 'https://mnsfantasy.com'

  return (
    <header className="fixed top-0 left-0 right-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-background)]/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="font-display text-2xl tracking-wide text-[var(--color-foreground)]">
            MNS<span className="text-neon-green">golf</span>
          </span>
        </Link>

        <nav className="hidden sm:flex items-center gap-6 text-sm text-[var(--color-muted-foreground)]">
          <Link to="/pools" className="hover:text-[var(--color-foreground)] transition-colors">Pools</Link>
          <SignedIn>
            <Link to="/dashboard" className="hover:text-[var(--color-foreground)] transition-colors">Dashboard</Link>
            <AdminNav />
          </SignedIn>
          <a href={platformUrl} className="hover:text-[var(--color-foreground)] transition-colors">All Games</a>
        </nav>

        <div className="flex items-center gap-3">
          <SignedIn>
            <UserButton
              afterSignOutUrl="/"
              appearance={{ elements: { avatarBox: 'w-8 h-8' } }}
            />
          </SignedIn>
          <SignedOut>
            <Link to="/sign-in">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link to="/sign-up">
              <Button size="sm">Sign Up</Button>
            </Link>
          </SignedOut>
        </div>
      </div>
    </header>
  )
}
