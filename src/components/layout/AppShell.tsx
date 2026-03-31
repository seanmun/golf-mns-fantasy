import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Footer } from './Footer'
import { MobileNav } from './MobileNav'
import { useUserSync } from '@/hooks/useUserSync'

export function AppShell() {
  useUserSync()
  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-background)]">
      <Header />
      <main className="flex-1 pt-16 pb-16 sm:pb-0">
        <Outlet />
      </main>
      <div className="hidden sm:block">
        <Footer />
      </div>
      <MobileNav />
    </div>
  )
}
