import { Routes, Route } from 'react-router-dom'
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react'
import { AppShell } from '@/components/layout/AppShell'
import { Landing } from '@/pages/Landing'
import { Dashboard } from '@/pages/Dashboard'
import { PoolBrowse } from '@/pages/pool/PoolBrowse'
import { PoolCreate } from '@/pages/pool/PoolCreate'
import { PoolJoin } from '@/pages/pool/PoolJoin'
import { PoolDetail } from '@/pages/pool/PoolDetail'
import { PoolPick } from '@/pages/pool/PoolPick'
import { PoolLeaderboard } from '@/pages/pool/PoolLeaderboard'
import { AdminPanel } from '@/pages/admin/AdminPanel'
import { NotFound } from '@/pages/NotFound'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut><RedirectToSignIn /></SignedOut>
    </>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Landing />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/pools" element={<PoolBrowse />} />
        <Route path="/pools/create" element={<ProtectedRoute><PoolCreate /></ProtectedRoute>} />
        <Route path="/pools/join/:joinCode" element={<ProtectedRoute><PoolJoin /></ProtectedRoute>} />
        <Route path="/pools/:poolId" element={<PoolDetail />} />
        <Route path="/pools/:poolId/pick" element={<ProtectedRoute><PoolPick /></ProtectedRoute>} />
        <Route path="/pools/:poolId/leaderboard" element={<PoolLeaderboard />} />
        <Route path="/admin" element={<ProtectedRoute><AdminPanel /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
