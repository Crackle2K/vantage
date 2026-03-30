import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Award, LayoutDashboard, LogIn, LogOut, Menu, Moon, Settings, Sun, User, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

export function Header() {
  const { user, isAuthenticated, signOut } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const [sideMenuOpen, setSideMenuOpen] = useState(false);

  // Close side menu on route change
  useEffect(() => {
    setSideMenuOpen(false);
  }, [location.pathname]);

  // Lock body scroll when side menu is open
  useEffect(() => {
    if (sideMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [sideMenuOpen]);

  const handleSignOut = () => {
    signOut();
    setSideMenuOpen(false);
    navigate('/');
  };

  const navLinks = [
    { to: '/businesses', label: 'Explore' },
    { to: '/decide', label: 'Decide' },
    { to: '/saved', label: 'Saved' },
    { to: '/activity', label: 'Activity' },
    { to: '/pricing', label: 'Pricing' },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      {/* Floating glass pill navbar */}
      <header
        className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl rounded-2xl bg-[hsl(var(--background)/0.7)] backdrop-blur-xl border border-[hsl(var(--border)/0.5)] shadow-[0_8px_32px_-8px_hsl(var(--shadow-soft)/0.3)]"
      >
        <div className="flex h-12 items-center justify-between px-5">
          {/* Left: Logo + Brand */}
          <Link to="/" className="flex items-center gap-2">
            <img className="h-7 w-7" src="/Images/Vantage.png" alt="Vantage Logo" />
            <span className="font-heading text-lg font-bold tracking-tight text-[hsl(var(--foreground))]">Vantage</span>
          </Link>

          {/* Right: Context-dependent actions */}
          <div className="flex items-center gap-2">
            {isAuthenticated && user ? (
              <>
                {/* Hamburger menu button */}
                <button
                  onClick={() => setSideMenuOpen(true)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors duration-200 hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
                  aria-label="Open menu"
                >
                  <Menu className="h-4.5 w-4.5" />
                </button>

                {/* Profile picture */}
                <Link
                  to={`/user/${user.id}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full overflow-hidden ring-2 ring-[hsl(var(--border)/0.5)] transition-all duration-200 hover:ring-[hsl(var(--primary)/0.6)]"
                >
                  {user.profile_picture ? (
                    <img
                      src={user.profile_picture}
                      alt={user.name || 'Profile'}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-primary text-[11px] font-bold text-primary-foreground">
                      {user.name?.[0]?.toUpperCase() || 'U'}
                    </div>
                  )}
                </Link>
              </>
            ) : (
              <>
                {/* Theme toggle */}
                <button
                  onClick={toggleTheme}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors duration-200 hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
                  aria-label="Toggle theme"
                >
                  {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>

                {/* Sign In */}
                <Link
                  to="/login"
                  className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary/90"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  Sign In
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Side menu drawer (logged in only) */}
      {isAuthenticated && user && (
        <>
          {/* Overlay */}
          <div
            className={cn(
              'fixed inset-0 z-60 bg-black/40 backdrop-blur-sm transition-opacity duration-300',
              sideMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            )}
            onClick={() => setSideMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Panel */}
          <aside
            className={cn(
              'fixed top-0 right-0 z-70 h-full w-72 bg-[hsl(var(--card))] border-l border-[hsl(var(--border))] shadow-[-8px_0_32px_-8px_hsl(var(--shadow-soft)/0.4)] transition-transform duration-300 ease-out',
              sideMenuOpen ? 'translate-x-0' : 'translate-x-full'
            )}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            <div className="flex h-full flex-col">
              {/* Header row */}
              <div className="flex h-14 items-center justify-between border-b border-[hsl(var(--border))] px-5">
                <span className="font-heading text-sm font-semibold text-[hsl(var(--foreground))]">Menu</span>
                <button
                  onClick={() => setSideMenuOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
                  aria-label="Close menu"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto px-3 py-4">
                {/* Theme toggle row */}
                <button
                  onClick={toggleTheme}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
                >
                  {isDark ? <Sun className="h-4 w-4 text-[hsl(var(--muted-foreground))]" /> : <Moon className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />}
                  <span className="text-ui font-medium">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
                </button>

                {/* Divider */}
                <div className="my-3 border-t border-[hsl(var(--border))]" />

                {/* Nav links */}
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

                {/* Divider */}
                <div className="my-3 border-t border-[hsl(var(--border))]" />

                {/* User section */}
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

              {/* Sign out at bottom */}
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
  );
}
