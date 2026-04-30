import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/layout/Layout'
import Login from './components/auth/Login'
import Register from './components/auth/Register'
import Onboarding from './components/auth/Onboarding'
import Dashboard from './pages/Dashboard'
import TradeLog from './pages/TradeLog'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import WeeklyReview from './pages/WeeklyReview'
import LoadingScreen from './components/shared/LoadingScreen'

function PrivateRoute({ children }) {
  const { user, userProfile, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  if (user && !userProfile?.onboardingComplete) return <Navigate to="/onboarding" replace />
  return children
}

function AuthRoute({ children }) {
  const { user, userProfile, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (user && !userProfile?.onboardingComplete) return <Navigate to="/onboarding" replace />
  if (user && userProfile?.onboardingComplete) return <Navigate to="/" replace />
  return children
}

function OnboardingRoute({ children }) {
  const { user, userProfile, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  if (userProfile?.onboardingComplete) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthRoute><Login /></AuthRoute>} />
      <Route path="/register" element={<AuthRoute><Register /></AuthRoute>} />
      <Route path="/onboarding" element={<OnboardingRoute><Onboarding /></OnboardingRoute>} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="trades" element={<TradeLog />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="weekly-review" element={<WeeklyReview />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
