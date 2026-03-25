import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Award, LayoutDashboard, LogIn, LogOut, Menu, Moon, Settings, Sun, User, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

export function Header() {
  const { user, isAuthenticated, signOut } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {

    setMobileOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

  const handleSignOut = () => {
    signOut();
    setUserMenuOpen(false);
    navigate('/');
  };

  const navLinks = [
    { to: '/', label: 'Home' },
    { to: '/businesses', label: 'Explore' },
    { to: '/decide', label: 'Decide' },
    { to: '/saved', label: 'Saved' },
    { to: '/activity', label: 'Activity' },
    { to: '/pricing', label: 'Pricing' },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <header
      className={cn(
        'sticky top-0 z-50 transition-all duration-200',
        scrolled ? 'glass border-b border-[hsl(var(--border))/0.75]' : 'bg-transparent border-b border-transparent'
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <img className="h-6 w-6" src="/Images/Vantage.png" alt="Vantage Logo" />
          </div>
          <span className="font-heading text-xl font-bold tracking-tight text-[hsl(var(--foreground))]">Vantage</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={cn(
                'rounded-lg px-4 py-2 text-ui font-medium transition-colors duration-200',
                isActive(link.to)
                  ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]'
                  : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]'
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors duration-200 hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {isAuthenticated && user ? (
            <div className="relative hidden md:block">
              <button
                onClick={() => setUserMenuOpen((prev) => !prev)}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 transition-colors duration-200 hover:bg-[hsl(var(--secondary))]"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-caption font-bold text-primary-foreground">
                  {user.name?.[0]?.toUpperCase() || 'U'}
                </div>
                <span className="max-w-[120px] truncate text-ui font-medium text-[hsl(var(--foreground))]">{user.name}</span>
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div className="animate-slide-down absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[0_12px_28px_-16px_hsl(var(--shadow-soft)/0.7)]">
                    <div className="border-b border-[hsl(var(--border))] p-3">
                      <p className="text-ui font-semibold text-[hsl(var(--foreground))]">{user.name}</p>
                      <p className="truncate text-caption text-[hsl(var(--muted-foreground))]">{user.email}</p>
                    </div>
                    <div className="p-1.5">
                      {user.role === 'business_owner' && (
                        <button
                          onClick={() => {
                            navigate('/dashboard');
                            setUserMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-ui text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
                        >
                          <LayoutDashboard className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                          Dashboard
                        </button>
                      )}
                      {user.role === 'business_owner' && (
                        <button
                          onClick={() => {
                            navigate('/claim');
                            setUserMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-ui text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
                        >
                          <Award className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                          Claim Business
                        </button>
                      )}
                      <button
                        onClick={() => {
                          navigate('/settings');
                          setUserMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-ui text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
                      >
                        <Settings className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                        Settings
                      </button>
                      <button
                        onClick={() => {
                          navigate('/account');
                          setUserMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-ui text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
                      >
                        <User className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                        My Account
                      </button>
                      <button
                        onClick={handleSignOut}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-ui text-error transition-colors hover:bg-error"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Link to="/login">
                <Button variant="ghost" size="sm" className="gap-1.5 min-w-[100px] text-sm">
                  <LogIn className="h-4 w-4" />
                  Sign In
                </Button>
              </Link>
              <Link to="/signup">
                <Button size="sm" className="gap-1.5 min-w-[100px] text-sm">
                  <UserPlus className="h-4 w-4" />
                  Sign Up
                </Button>
              </Link>
            </div>
          )}

          <button
            onClick={() => setMobileOpen((prev) => !prev)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))] md:hidden"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="animate-slide-down border-t border-[hsl(var(--border))] px-4 pb-4 pt-3 md:hidden">
          <nav className="mb-3 flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={cn(
                  'rounded-lg px-4 py-2.5 text-ui font-medium transition-colors',
                  isActive(link.to)
                    ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]'
                    : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]'
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          {isAuthenticated ? (
            <div className="flex flex-col gap-1 border-t border-[hsl(var(--border))] pt-3">
              {user?.role === 'business_owner' && (
                <Link
                  to="/dashboard"
                  className="flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-ui font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Link>
              )}
              {user?.role === 'business_owner' && (
                <Link
                  to="/claim"
                  className="flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-ui font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
                >
                  <Award className="h-4 w-4" />
                  Claim Business
                </Link>
              )}
              <Link
                to="/settings"
                className="flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-ui font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>
              <Link
                to="/account"
                className="flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-ui font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
              >
                <User className="h-4 w-4" />
                My Account
              </Link>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-left text-ui font-medium text-error hover:bg-error"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          ) : (
            <div className="flex gap-2 border-t border-[hsl(var(--border))] pt-3">
              <Link to="/login" className="flex-1">
                <Button variant="outline" className="w-full">
                  Sign In
                </Button>
              </Link>
              <Link to="/signup" className="flex-1">
                <Button className="w-full">Sign Up</Button>
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
