import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from '@/store/AuthContext'
import { TradeProvider } from '@/store/TradeContext'
import { HoldingsProvider } from '@/store/HoldingsContext'
import { Shell } from '@/components/layout/Shell'
import { SignIn } from '@/pages/SignIn'
import { Spinner } from '@/components/ui/Primitives'
import { ErrorBoundary } from '@/components/layout/ErrorBoundary'

const Desk = lazy(() => import('@/pages/Desk').then((m) => ({ default: m.Desk })))
const Trades = lazy(() => import('@/pages/Trades').then((m) => ({ default: m.Trades })))
const Analysis = lazy(() => import('@/pages/Analysis').then((m) => ({ default: m.Analysis })))
const Portfolio = lazy(() => import('@/pages/Portfolio').then((m) => ({ default: m.Portfolio })))
const Data = lazy(() => import('@/pages/Data').then((m) => ({ default: m.Data })))
const Settings = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.Settings })))

function Booting({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex items-center gap-2 text-ink-400 text-xs animate-fade-in">
        <Spinner /> {label}
      </div>
    </div>
  )
}

/** Single-user tool: signed out shows the sign-in form, signed in shows the app. */
function Gate() {
  const { user, loading } = useAuth()
  if (loading) return <Booting label="Connecting" />
  if (!user) return <SignIn />

  return (
    <TradeProvider>
      <HoldingsProvider>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Suspense fallback={<Booting />}><Desk /></Suspense>} />
            <Route path="trades" element={<Suspense fallback={<Booting />}><Trades /></Suspense>} />
            <Route path="analysis" element={<Suspense fallback={<Booting />}><Analysis /></Suspense>} />
            <Route path="portfolio" element={<Suspense fallback={<Booting />}><Portfolio /></Suspense>} />
            <Route path="data" element={<Suspense fallback={<Booting />}><Data /></Suspense>} />
            <Route path="settings" element={<Suspense fallback={<Booting />}><Settings /></Suspense>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HoldingsProvider>
    </TradeProvider>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Gate />
          <Toaster
            position="bottom-right"
            toastOptions={{
              duration: 3200,
              style: {
                background: '#11161F',
                color: '#D8DFE9',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontFamily: '"Instrument Sans Variable", "Instrument Sans", system-ui, sans-serif',
                letterSpacing: '0.004em',
                padding: '9px 13px',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 0 0 1px rgba(255,255,255,0.06), ' +
                  '0 2px 6px rgba(0,0,0,0.45), 0 16px 40px -10px rgba(0,0,0,0.65)',
              },
              success: { iconTheme: { primary: '#2FCE72', secondary: '#05070B' } },
              error: { iconTheme: { primary: '#F2555A', secondary: '#05070B' } },
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
