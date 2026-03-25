import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import RootLayout from './layout'
import HomePage from './page'
import Businesses from './pages/Businesses'
import LoginPage from './pages/LoginPage'
import SignUpPage from './pages/SignUpPage'
import AccountPage from './pages/AccountPage'
import SettingsPage from './pages/SettingsPage'
import UserProfilePage from './pages/UserProfilePage'
import PricingPage from './pages/PricingPage'
import ActivityFeedPage from './pages/ActivityFeedPage'
import DashboardPage from './pages/DashboardPage'
import ClaimBusinessPage from './pages/ClaimBusinessPage'
import DecidePage from './pages/DecidePage'
import SavedPage from './pages/SavedPage'
import './index.css'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <RootLayout>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/businesses" element={<Businesses />} />
                <Route path="/decide" element={<DecidePage />} />
                <Route path="/saved" element={<SavedPage />} />
                <Route path="/activity" element={<ActivityFeedPage />} />
                <Route path="/pricing" element={<PricingPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/claim" element={<ClaimBusinessPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignUpPage />} />
                <Route path="/account" element={<AccountPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/user/:userId" element={<UserProfilePage />} />
              </Routes>
            </RootLayout>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </GoogleOAuthProvider>
  </StrictMode>,
)
