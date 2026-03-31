import { Link, useLocation } from 'react-router-dom'
import { SignedIn, SignedOut } from '@clerk/clerk-react'
import { Home, Users, Trophy, LayoutDashboard, LogIn } from 'lucide-react'

const navItems = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/players', label: 'Players', icon: Users },
  { to: '/pools', label: 'Pools', icon: Trophy },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, auth: true },
]

export function MobileNav() {
  const { pathname } = useLocation()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 sm:hidden border-t bg-[var(--color-background)]/95 backdrop-blur-md"
      style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex items-center justify-around h-14 px-2">
        {navItems.map(({ to, label, icon: Icon, auth }) => {
          const isActive = pathname === to || (to !== '/' && pathname.startsWith(to))
          const link = (
            <Link
              key={to}
              to={to}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 transition-colors"
              style={{ color: isActive ? 'var(--color-green-primary)' : 'var(--color-text-muted)' }}
            >
              <Icon size={20} />
              <span className="text-[10px]">{label}</span>
            </Link>
          )

          if (auth) {
            return (
              <SignedIn key={to}>
                {link}
              </SignedIn>
            )
          }
          return link
        })}

        <SignedOut>
          <Link
            to="/sign-in"
            className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 transition-colors"
            style={{ color: pathname === '/sign-in' ? 'var(--color-green-primary)' : 'var(--color-text-muted)' }}
          >
            <LogIn size={20} />
            <span className="text-[10px]">Sign In</span>
          </Link>
        </SignedOut>
      </div>
    </nav>
  )
}
