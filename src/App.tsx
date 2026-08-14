import { Routes, Route } from 'react-router-dom'
import { SignedIn, SignedOut, RedirectToSignIn, SignIn, SignUp, useUser } from '@clerk/clerk-react'
import { AppShell } from '@/components/layout/AppShell'
import { Landing } from '@/pages/Landing'
import { Dashboard } from '@/pages/Dashboard'
import { PoolBrowse } from '@/pages/pool/PoolBrowse'
import { PoolCreate } from '@/pages/pool/PoolCreate'
import { PoolJoin } from '@/pages/pool/PoolJoin'
import { PoolDetail } from '@/pages/pool/PoolDetail'
import { PoolPick } from '@/pages/pool/PoolPick'
import { PoolLeaderboard } from '@/pages/pool/PoolLeaderboard'
import { PoolDraft } from '@/pages/pool/PoolDraft'
import { PoolWaivers } from '@/pages/pool/PoolWaivers'
import { PoolManage } from '@/pages/pool/PoolManage'
import { AdminPanel } from '@/pages/admin/AdminPanel'
import { Players } from '@/pages/Players'
import { PlayerCard } from '@/pages/PlayerCard'
import { NotFound } from '@/pages/NotFound'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut><RedirectToSignIn /></SignedOut>
    </>
  )
}

// Signed-in users get the dashboard as their home; everyone else sees
// the marketing landing page. Rendered (not redirected) so the URL stays
// "/", and gated on isLoaded to avoid flashing the wrong one.
function Home() {
  const { isLoaded, isSignedIn } = useUser()
  if (!isLoaded) return null
  return isSignedIn ? <Dashboard /> : <Landing />
}

function AuthPage({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      {children}
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/sign-in/*" element={<AuthPage><SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" fallbackRedirectUrl="/dashboard" /></AuthPage>} />
        <Route path="/sign-up/*" element={<AuthPage><SignUp routing="path" path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/dashboard" /></AuthPage>} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/players" element={<Players />} />
        <Route path="/players/:id" element={<PlayerCard />} />
        <Route path="/pools" element={<PoolBrowse />} />
        <Route path="/pools/create" element={<ProtectedRoute><PoolCreate /></ProtectedRoute>} />
        {/* Public on purpose: an invite has to show what you were invited
            to BEFORE it asks you to sign in, or the link is a bounce. */}
        <Route path="/pools/join/:joinCode" element={<PoolJoin />} />
        <Route path="/pools/:poolId" element={<PoolDetail />} />
        <Route path="/pools/:poolId/pick" element={<ProtectedRoute><PoolPick /></ProtectedRoute>} />
        <Route path="/pools/:poolId/manage" element={<ProtectedRoute><PoolManage /></ProtectedRoute>} />
        <Route path="/pools/:poolId/leaderboard" element={<PoolLeaderboard />} />
        <Route path="/pools/:poolId/draft" element={<ProtectedRoute><PoolDraft /></ProtectedRoute>} />
        <Route path="/pools/:poolId/waivers" element={<ProtectedRoute><PoolWaivers /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><AdminPanel /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
