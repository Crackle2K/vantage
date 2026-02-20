import { useState, useEffect } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { Store, User, LogOut, Moon, Sun, Menu, X, LogIn, UserPlus, LayoutDashboard, Award } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/AuthContext"
import { cn } from "@/lib/utils"

export function Header() {
  const { user, isAuthenticated, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [isDark, setIsDark] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('vantage-theme')
    if (saved === 'dark') {
      setIsDark(true)
      document.documentElement.classList.add('dark')
    }
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
    setUserMenuOpen(false)
  }, [location.pathname])

  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('vantage-theme', next ? 'dark' : 'light')
  }

  const handleSignOut = () => {
    signOut()
    setUserMenuOpen(false)
    navigate('/')
  }

  const navLinks = [
    { to: '/', label: 'Home' },
    { to: '/businesses', label: 'Explore' },
    { to: '/activity', label: 'Activity' },
    { to: '/pricing', label: 'Pricing' },
  ]

  const isActive = (path: string) => location.pathname === path

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-all duration-300",
        scrolled
          ? "glass shadow-lg shadow-black/[0.03] dark:shadow-black/[0.15]"
          : "bg-transparent"
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center shadow-md shadow-[#22c55e]/25 group-hover:shadow-lg group-hover:shadow-[#22c55e]/30 transition-shadow duration-300">
              <Store className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="text-xl font-bold text-[hsl(var(--foreground))] tracking-tight font-heading">
              Van<span className="gradient-text font-serif">tage</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 font-sub",
                  isActive(link.to)
                    ? "bg-[hsl(var(--primary))] text-white shadow-md shadow-[#22c55e]/25"
                    : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-all duration-200"
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
            </button>

            {/* Auth Buttons */}
            {isAuthenticated && user ? (
              <div className="relative hidden md:block">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[hsl(var(--secondary))] transition-all duration-200"
                >
                  <div className="w-7 h-7 rounded-full gradient-primary flex items-center justify-center text-white text-xs font-bold">
                    {user.name?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <span className="text-sm font-medium text-[hsl(var(--foreground))] max-w-[120px] truncate">
                    {user.name}
                  </span>
                </button>

                {userMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] shadow-xl shadow-black/10 dark:shadow-black/30 z-50 animate-slide-down overflow-hidden">
                      <div className="p-3 border-b border-[hsl(var(--border))]">
                        <p className="text-sm font-semibold text-[hsl(var(--foreground))]">{user.name}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">{user.email}</p>
                      </div>
                      <div className="p-1.5">
                        {user.role === 'business_owner' && (
                          <button
                            onClick={() => { navigate('/dashboard'); setUserMenuOpen(false); }}
                            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-colors"
                          >
                            <LayoutDashboard className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                            Dashboard
                          </button>
                        )}
                        {user.role === 'business_owner' && (
                          <button
                            onClick={() => { navigate('/claim'); setUserMenuOpen(false); }}
                            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-colors"
                          >
                            <Award className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                            Claim Business
                          </button>
                        )}
                        <button
                          onClick={() => { navigate('/account'); setUserMenuOpen(false); }}
                          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-colors"
                        >
                          <User className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                          My Account
                        </button>
                        <button
                          onClick={handleSignOut}
                          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="hidden md:flex items-center gap-2">
                <Link to="/login">
                  <Button variant="ghost" size="sm" className="gap-1.5">
                    <LogIn className="w-4 h-4" />
                    Sign In
                  </Button>
                </Link>
                <Link to="/signup">
                  <Button size="sm" className="gap-1.5 gradient-primary text-white border-0 shadow-md shadow-[#22c55e]/25 hover:shadow-lg hover:shadow-[#22c55e]/30 transition-shadow">
                    <UserPlus className="w-4 h-4" />
                    Sign Up
                  </Button>
                </Link>
              </div>
            )}

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-all"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileOpen && (
          <div className="md:hidden pb-4 animate-slide-down border-t border-[hsl(var(--border))] mt-2 pt-4">
            <nav className="flex flex-col gap-1 mb-4">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={cn(
                    "px-4 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive(link.to)
                      ? "bg-[hsl(var(--primary))] text-white"
                      : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]"
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            {isAuthenticated ? (
              <div className="flex flex-col gap-1 border-t border-[hsl(var(--border))] pt-3">
                {user?.role === 'business_owner' && (
                  <Link to="/dashboard" className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]">
                    <LayoutDashboard className="w-4 h-4" />
                    Dashboard
                  </Link>
                )}
                {user?.role === 'business_owner' && (
                  <Link to="/claim" className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]">
                    <Award className="w-4 h-4" />
                    Claim Business
                  </Link>
                )}
                <Link to="/account" className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]">
                  <User className="w-4 h-4" />
                  My Account
                </Link>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 text-left"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="flex gap-2 border-t border-[hsl(var(--border))] pt-3">
                <Link to="/login" className="flex-1">
                  <Button variant="outline" className="w-full">Sign In</Button>
                </Link>
                <Link to="/signup" className="flex-1">
                  <Button className="w-full gradient-primary text-white border-0">Sign Up</Button>
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
