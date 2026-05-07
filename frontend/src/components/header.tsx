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
  Moon,
  Settings,
  Sun,
  User,
  X
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { cn } from '@/lib/utils'

/**
 * Top navigation bar rendered as a compact editorial bar. Shows logo and auth
 * controls; logged-in users get a hamburger that opens a right-side
 * drawer with nav links, theme toggle, dashboard/claim links (for
 * business owners), and sign-out.
 *
 * Side effects:
 * - Closes the side menu on route change.
 * - Locks body scroll when the side menu is open.
 *
 * @returns {JSX.Element} The header bar and optional side drawer.
 */
export function Header() {
  const { user, isAuthenticated, signOut } = useAuth()
  const { isDark, toggleTheme } = useTheme()
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
        <Link to="/" className="min-nav__brand" aria-label="Vantage homepage">
          <img src="/Images/Vantage.png" alt="Vantage logo" className="min-nav__logo" />
          <span>VANTAGE</span>
        </Link>

        <div className="min-nav__actions">
          {isAuthenticated && user ? (
            <>
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
              <button
                onClick={() => setSideMenuOpen(true)}
                className="min-secondary-button gap-2 px-3"
                aria-label="Open menu"
              >
                <Menu className="h-4 w-4" />
                <span className="hidden sm:inline">Menu</span>
              </button>
            </>
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
              'fixed inset-0 z-60 bg-black/40 transition-opacity duration-300',
              sideMenuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
            )}
            onClick={() => setSideMenuOpen(false)}
            aria-hidden="true"
          />

          <aside
            className={cn(
              'fixed top-0 right-0 z-70 h-full w-72 border-l border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[0_2px_8px_hsl(var(--shadow-soft)/0.04)] transition-transform duration-300 ease-out',
              sideMenuOpen ? 'translate-x-0' : 'translate-x-full'
            )}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            <div className="flex h-full flex-col">
              <div className="flex h-14 items-center justify-between border-b border-[hsl(var(--border))] px-5">
                <span className="font-heading text-sm font-semibold text-[hsl(var(--foreground))]">
                  Menu
                </span>
                <button
                  onClick={() => setSideMenuOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
                  aria-label="Close menu"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-4">
                <button
                  onClick={toggleTheme}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
                >
                  {isDark ? (
                    <Sun className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                  ) : (
                    <Moon className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                  )}
                  <span className="text-ui font-medium">
                    {isDark ? 'Light Mode' : 'Dark Mode'}
                  </span>
                </button>

                <div className="my-3 border-t border-[hsl(var(--border))]" />

                <nav className="flex flex-col gap-0.5">
                  {navLinks.map((link) => (
                    <Link
                      key={link.to}
                      to={link.to}
                      onClick={() => setSideMenuOpen(false)}
                      className={cn(
                        'rounded-lg px-3 py-2.5 text-ui font-medium transition-colors',
                        isActive(link.to)
                          ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]'
                          : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]'
                      )}
                    >
                      {link.label}
                    </Link>
                  ))}
                </nav>

                <div className="my-3 border-t border-[hsl(var(--border))]" />

                {user.role === 'business_owner' && (
                  <>
                    <Link
                      to="/dashboard"
                      onClick={() => setSideMenuOpen(false)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-ui font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
                    >
                      <LayoutDashboard className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                      Dashboard
                    </Link>
                    <Link
                      to="/claim"
                      onClick={() => setSideMenuOpen(false)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-ui font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
                    >
                      <Award className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                      Claim Business
                    </Link>
                  </>
                )}
                <Link
                  to="/settings"
                  onClick={() => setSideMenuOpen(false)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-ui font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
                >
                  <Settings className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                  Settings
                </Link>
                <Link
                  to="/account"
                  onClick={() => setSideMenuOpen(false)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-ui font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
                >
                  <User className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                  My Account
                </Link>
              </div>

              <div className="border-t border-[hsl(var(--border))] p-3">
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-ui font-medium text-error transition-colors hover:bg-error"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  )
}
