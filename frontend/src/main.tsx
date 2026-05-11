/**
 * @fileoverview Application entry point. Mounts the React root with routing,
 * authentication, theme, and Google OAuth providers.
 */

import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import RootLayout from './layout'
import './index.css'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const GoogleOAuthBoundary = lazy(() => import('./components/GoogleOAuthBoundary'))
const HomePage = lazy(() => import('./page'))
const Businesses = lazy(() => import('./pages/Businesses'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const SignUpPage = lazy(() => import('./pages/SignUpPage'))
const AccountPage = lazy(() => import('./pages/AccountPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const UserProfilePage = lazy(() => import('./pages/UserProfilePage'))
const PricingPage = lazy(() => import('./pages/PricingPage'))
const ActivityFeedPage = lazy(() => import('./pages/ActivityFeedPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const ClaimBusinessPage = lazy(() => import('./pages/ClaimBusinessPage'))
const DecidePage = lazy(() => import('./pages/DecidePage'))
const SavedPage = lazy(() => import('./pages/SavedPage'))

function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="loading-spinner" aria-label="Loading" />
    </div>
  )
}

function HomeRoute() {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return <RouteFallback />
  }

  if (isAuthenticated) {
    return <Navigate to="/businesses" replace />
  }

  return <HomePage />
}

/**
 * Renders the full application tree into the DOM root.
 *
 * Provider hierarchy (outer to inner):
 * - StrictMode: development-only checks
 * - ThemeProvider: light-mode theme state
 * - BrowserRouter: client-side routing
 * - AuthProvider: current user session
 * - RootLayout: shared header, footer, and page shell
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <RootLayout>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<HomeRoute />} />
                <Route path="/businesses" element={<Businesses />} />
                <Route path="/decide" element={<DecidePage />} />
                <Route path="/saved" element={<SavedPage />} />
                <Route path="/activity" element={<ActivityFeedPage />} />
                <Route path="/pricing" element={<PricingPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/claim" element={<ClaimBusinessPage />} />
                <Route
                  path="/login"
                  element={
                    <GoogleOAuthBoundary clientId={GOOGLE_CLIENT_ID}>
                      <LoginPage />
                    </GoogleOAuthBoundary>
                  }
                />
                <Route
                  path="/signup"
                  element={
                    <GoogleOAuthBoundary clientId={GOOGLE_CLIENT_ID}>
                      <SignUpPage />
                    </GoogleOAuthBoundary>
                  }
                />
                <Route path="/account" element={<AccountPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/user/:userId" element={<UserProfilePage />} />
              </Routes>
            </Suspense>
          </RootLayout>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)
