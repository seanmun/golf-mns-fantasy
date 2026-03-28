import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import App from './App'
import './index.css'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
if (!publishableKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY')

const platformUrl = import.meta.env.VITE_PLATFORM_URL || 'https://mnsfantasy.com'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: true,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={publishableKey}
      isSatellite
      domain="mnsfantasy.com"
      signInUrl={`${platformUrl}/sign-in`}
      signUpUrl={`${platformUrl}/sign-up`}
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
      afterSignOutUrl={platformUrl}
    >
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
          <Toaster
            position="top-right"
            theme="dark"
            toastOptions={{
              style: {
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
              },
            }}
          />
        </BrowserRouter>
      </QueryClientProvider>
    </ClerkProvider>
  </StrictMode>
)
