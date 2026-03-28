import { Link } from 'react-router-dom'
import { SignedIn, SignedOut, UserButton } from '@clerk/clerk-react'
import { Button } from '@/components/ui/Button'

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
          </SignedIn>
          <a href={platformUrl} className="hover:text-[var(--color-foreground)] transition-colors">All Games</a>
        </nav>

        <div className="flex items-center gap-3">
          <SignedIn>
            <UserButton
              afterSignOutUrl={platformUrl}
              appearance={{ elements: { avatarBox: 'w-8 h-8' } }}
            />
          </SignedIn>
          <SignedOut>
            <a href={`${platformUrl}/sign-in?redirect_url=${encodeURIComponent(window.location.href)}`}>
              <Button variant="ghost" size="sm">Sign In</Button>
            </a>
            <a href={`${platformUrl}/sign-up?redirect_url=${encodeURIComponent(window.location.href)}`}>
              <Button size="sm">Sign Up</Button>
            </a>
          </SignedOut>
        </div>
      </div>
    </header>
  )
}
