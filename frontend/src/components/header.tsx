/**
 * @fileoverview Shared navigation header styled from the landing page navbar.
 * Preserves the authenticated drawer flow while keeping a single navbar
 * implementation across all routes.
 */

import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Award,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  User,
  X
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

/**
 * Top navigation bar rendered as a compact editorial bar. Shows logo and auth
 * controls; logged-in users get a left-side hamburger drawer with primary
 * nav links, account links, and sign-out.
 *
 * Side effects:
 * - Closes the side menu on route change.
 * - Locks body scroll when the side menu is open.
 *
 * @returns {JSX.Element} The header bar and optional side drawer.
 */
export function Header() {
  const { user, isAuthenticated, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [sideMenuOpen, setSideMenuOpen] = useState(false)
  const [isPastHero, setIsPastHero] = useState(false)

  const isLandingPageRoute = location.pathname === '/'

  useEffect(() => {
    setSideMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (sideMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [sideMenuOpen])

  useEffect(() => {
    if (!isLandingPageRoute) {
      setIsPastHero(false)
      return
    }

    let frameId: number | null = null
    let timeoutId: number | null = null

    const updateHeroBoundary = (): void => {
      const heroSection = document.querySelector<HTMLElement>('.min-hero')
      if (!heroSection) {
        setIsPastHero(false)
        return
      }

      const { bottom } = heroSection.getBoundingClientRect()
      setIsPastHero(bottom <= 0)
    }

    const scheduleUpdate = (): void => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
      frameId = window.requestAnimationFrame(updateHeroBoundary)
    }

    scheduleUpdate()
    timeoutId = window.setTimeout(updateHeroBoundary, 120)
    window.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate)

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      window.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
    }
  }, [isLandingPageRoute])

  const handleSignOut = () => {
    signOut()
    setSideMenuOpen(false)
    navigate('/')
  }

  const navLinks = [
    { to: '/businesses', label: 'Explore' },
    { to: '/decide', label: 'Decide' },
    { to: '/saved', label: 'Saved' },
    { to: '/activity', label: 'Activity' },
    { to: '/pricing', label: 'Pricing' }
  ]

  const isActive = (path: string) => location.pathname === path

  return (
    <>
      <header
        className={cn(
          'min-theme min-nav',
          isLandingPageRoute && isPastHero && 'min-nav--transparent'
        )}
      >
        <div className="min-nav__leading">
          {isAuthenticated && user && (
            <button
              onClick={() => setSideMenuOpen(true)}
              className="min-secondary-button min-nav__menu-button"
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </button>
          )}
          <Link
            to={isAuthenticated ? '/businesses' : '/'}
            className="min-nav__brand"
            aria-label="Vantage homepage"
          >
            <img src="/Images/Vantage.png" alt="Vantage logo" className="min-nav__logo" />
            <span>VANTAGE</span>
          </Link>
        </div>

        <div className="min-nav__actions">
          {isAuthenticated && user ? (
            <Link
              to={`/user/${user.id}`}
              className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-[rgba(154,121,50,0.34)] bg-[var(--min-paper)] text-[var(--min-forest)] transition-colors duration-200 hover:border-[rgba(154,121,50,0.55)] hover:bg-[var(--min-gold-soft)]"
              aria-label="Open profile"
            >
              {user.profile_picture ? (
                <img
                  src={user.profile_picture}
                  alt={user.name || 'Profile'}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-[12px] font-bold">
                  {user.name?.[0]?.toUpperCase() || 'U'}
                </span>
              )}
            </Link>
          ) : (
            <>
              <Link to="/login" className="min-secondary-button min-nav__button">
                SIGN IN
              </Link>
            </>
          )}
        </div>
      </header>

      {isAuthenticated && user && (
        <>
          <div
            className={cn(
              'explore-menu-backdrop transition-opacity duration-300',
              sideMenuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
            )}
            onClick={() => setSideMenuOpen(false)}
            aria-hidden="true"
          />

          <aside
            className={cn(
              'explore-menu-drawer min-theme transition-transform duration-300 ease-out',
              sideMenuOpen ? 'translate-x-0' : '-translate-x-full'
            )}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            <div className="flex h-full flex-col">
              <div className="explore-menu-drawer__header">
                <Link
                  to={isAuthenticated ? '/businesses' : '/'}
                  onClick={() => setSideMenuOpen(false)}
                  className="explore-menu-drawer__brand"
                  aria-label="Vantage home"
                >
                  <img
                    src="/Images/Vantage.png"
                    alt="Vantage logo"
                  />
                  <span>Vantage</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setSideMenuOpen(false)}
                  aria-label="Close menu"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <nav className="explore-menu-drawer__nav">
                  <div className="explore-menu-drawer__section">
                    {navLinks.map((link) => (
                      <Link
                        key={link.to}
                        to={link.to}
                        onClick={() => setSideMenuOpen(false)}
                        className={cn(isActive(link.to) && 'is-active')}
                      >
                        {link.label}
                      </Link>
                    ))}
                    {user.role === 'business_owner' && (
                      <>
                        <Link
                          to="/dashboard"
                          onClick={() => setSideMenuOpen(false)}
                          className={cn(isActive('/dashboard') && 'is-active')}
                        >
                          <LayoutDashboard className="h-4 w-4 text-[var(--min-muted)]" />
                          Dashboard
                        </Link>
                        <Link
                          to="/claim"
                          onClick={() => setSideMenuOpen(false)}
                          className={cn(isActive('/claim') && 'is-active')}
                        >
                          <Award className="h-4 w-4 text-[var(--min-muted)]" />
                          Claim Business
                        </Link>
                      </>
                    )}
                  </div>

                  <div className="explore-menu-drawer__section explore-menu-drawer__section--ruled">
                    <Link
                      to="/settings"
                      onClick={() => setSideMenuOpen(false)}
                      className={cn(isActive('/settings') && 'is-active')}
                    >
                      <Settings className="h-4 w-4 text-[var(--min-muted)]" />
                      Settings
                    </Link>
                    <Link
                      to="/account"
                      onClick={() => setSideMenuOpen(false)}
                      className={cn(isActive('/account') && 'is-active')}
                    >
                      <User className="h-4 w-4 text-[var(--min-muted)]" />
                      My Account
                    </Link>
                  </div>

                  <div className="explore-menu-drawer__section explore-menu-drawer__section--ruled">
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="explore-menu-drawer__danger"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </div>
                </nav>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  )
}
