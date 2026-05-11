/**
 * @fileoverview Google Maps-style Explore search shell. Owns the route-level
 * search bar, hamburger menu, profile shortcut, autocomplete, and category
 * tabs for the businesses page.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Award,
  Bed,
  Building2,
  Coffee,
  LayoutDashboard,
  LogOut,
  MapPin,
  Martini,
  Menu,
  Search,
  Settings,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  User,
  UserRound,
  Utensils,
  X
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export interface FilterCategory {
  label: string;
  count: number;
  value?: string;
}

export interface SearchSuggestion {
  id: string;
  label: string;
  description: string;
  type: 'business' | 'category' | 'tag';
  categoryValue?: string;
}

interface StickySearchFiltersProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  autocompleteSuggestions: SearchSuggestion[];
  onSuggestionSelect: (suggestion: SearchSuggestion) => void;
  categories: FilterCategory[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  filtersOpen: boolean;
  onFiltersToggle: () => void;
  locationLabel: string;
  locationActive: boolean;
  loadingLocation: boolean;
  onUseLocation: () => void;
}

/**
 * Renders the sticky Google Maps-style search shell for the explore page.
 *
 * @param {StickySearchFiltersProps} props - Search state, categories, and callbacks.
 * @returns {JSX.Element} The sticky search/filter section.
 */
export function StickySearchFilters({
  searchQuery,
  onSearchQueryChange,
  autocompleteSuggestions,
  onSuggestionSelect,
  categories,
  selectedCategory,
  onCategoryChange,
  filtersOpen,
  onFiltersToggle,
  locationLabel,
  locationActive,
  loadingLocation,
  onUseLocation,
}: StickySearchFiltersProps) {
  const { user, isAuthenticated, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const showSuggestions = focused && autocompleteSuggestions.length > 0;

  useEffect(() => {
    setActiveSuggestionIndex(0);
  }, [autocompleteSuggestions]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!shellRef.current?.contains(event.target as Node)) {
        setFocused(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  const commitSuggestion = (suggestion: SearchSuggestion) => {
    onSuggestionSelect(suggestion);
    setFocused(false);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSuggestionIndex((current) => (current + 1) % autocompleteSuggestions.length);
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSuggestionIndex((current) => (
        current === 0 ? autocompleteSuggestions.length - 1 : current - 1
      ));
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      commitSuggestion(autocompleteSuggestions[activeSuggestionIndex]);
    }

    if (event.key === 'Escape') {
      setFocused(false);
    }
  };

  const iconForSuggestion = (suggestion: SearchSuggestion) => {
    if (suggestion.type === 'business') return <MapPin className="h-4 w-4" />;
    if (suggestion.type === 'category') return <Building2 className="h-4 w-4" />;
    return <Sparkles className="h-4 w-4" />;
  };

  const iconForCategory = (label: string) => {
    switch (label) {
      case 'Restaurants':
        return <Utensils className="h-4 w-4" />;
      case 'Hotels':
        return <Bed className="h-4 w-4" />;
      case 'Things to do':
        return <Sparkles className="h-4 w-4" />;
      case 'Coffee':
        return <Coffee className="h-4 w-4" />;
      case 'Bars':
        return <Martini className="h-4 w-4" />;
      case 'Shopping':
        return <ShoppingBag className="h-4 w-4" />;
      case 'All':
        return <MapPin className="h-4 w-4" />;
      default:
        return <Building2 className="h-4 w-4" />;
    }
  };

  const navLinks = [
    { to: '/', label: 'Home' },
    { to: '/saved', label: 'Saved' },
    { to: '/activity', label: 'Activity' },
    { to: '/pricing', label: 'Pricing' },
  ];

  const isActive = (path: string) => location.pathname === path;

  const handleSignOut = () => {
    signOut();
    setMenuOpen(false);
    navigate('/');
  };

  return (
    <section className="explore-nav-search min-theme">
      <div className="explore-nav-search__inner">
        <div className="explore-nav-search__topline">
          <div className="explore-nav-search__box" ref={shellRef}>
            <button
              type="button"
              className="explore-nav-search__menu-button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Search className="explore-nav-search__icon" />
            <input
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              onFocus={() => setFocused(true)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search Vantage"
              className="explore-nav-search__input"
              role="combobox"
              aria-expanded={showSuggestions}
              aria-autocomplete="list"
              aria-controls="explore-search-suggestions"
            />
            <button
              type="button"
              className={`explore-nav-search__location ${locationActive ? 'is-active' : ''}`}
              onClick={onUseLocation}
              disabled={loadingLocation}
              aria-label="Use current location"
            >
              <MapPin className="h-4 w-4" />
              <span>{loadingLocation ? 'Locating...' : locationLabel}</span>
            </button>

            {showSuggestions && (
              <div
                id="explore-search-suggestions"
                className="explore-nav-search__suggestions"
                role="listbox"
              >
                {autocompleteSuggestions.map((suggestion, index) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    className={`explore-nav-search__suggestion ${index === activeSuggestionIndex ? 'is-active' : ''}`}
                    onMouseEnter={() => setActiveSuggestionIndex(index)}
                    onClick={() => commitSuggestion(suggestion)}
                    role="option"
                    aria-selected={index === activeSuggestionIndex}
                  >
                    <span className="explore-nav-search__suggestion-icon">
                      {iconForSuggestion(suggestion)}
                    </span>
                    <span>
                      <strong>{suggestion.label}</strong>
                      <small>{suggestion.description}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Link
            to={isAuthenticated && user ? `/user/${user.id}` : '/login'}
            className="explore-nav-search__profile"
            aria-label={isAuthenticated ? 'Open profile' : 'Sign in'}
          >
            {isAuthenticated && user?.profile_picture ? (
              <img src={user.profile_picture} alt={user.name || 'Profile'} />
            ) : isAuthenticated && user?.name ? (
              <span>{user.name[0]?.toUpperCase()}</span>
            ) : (
              <UserRound className="h-5 w-5" />
            )}
          </Link>
        </div>

        <div className="explore-nav-search__tags">
          <div className="no-scrollbar explore-nav-search__tab-scroll">
            <button
              type="button"
              className={`explore-nav-search__tab ${filtersOpen ? 'is-active' : ''}`}
              onClick={onFiltersToggle}
              aria-label="Open filters"
              aria-expanded={filtersOpen}
            >
              <span className="explore-nav-search__tab-icon">
                <SlidersHorizontal className="h-4 w-4" />
              </span>
              <span>Filters</span>
            </button>
            {categories.map((category) => (
              <button
                key={category.label}
                type="button"
                onClick={() => onCategoryChange(category.value ?? category.label)}
                className={`explore-nav-search__tab ${selectedCategory === (category.value ?? category.label) ? 'is-active' : ''}`}
              >
                <span className="explore-nav-search__tab-icon">
                  {iconForCategory(category.label)}
                </span>
                <span>{category.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {menuOpen && (
        <>
          <div
            className="explore-menu-backdrop"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="explore-menu-drawer min-theme" role="dialog" aria-modal="true" aria-label="Explore menu">
            <div className="flex h-full flex-col">
              <div className="explore-menu-drawer__header">
                <Link
                  to={isAuthenticated ? '/businesses' : '/'}
                  className="explore-menu-drawer__brand"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Vantage home"
                >
                  <img src="/Images/Vantage.png" alt="Vantage logo" />
                  <span>Vantage</span>
                </Link>
                <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu">
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
                        onClick={() => setMenuOpen(false)}
                        className={cn(isActive(link.to) && 'is-active')}
                      >
                        {link.label}
                      </Link>
                    ))}
                    {user?.role === 'business_owner' && (
                      <>
                        <Link
                          to="/dashboard"
                          onClick={() => setMenuOpen(false)}
                          className={cn(isActive('/dashboard') && 'is-active')}
                        >
                          <LayoutDashboard className="h-4 w-4 text-[var(--min-muted)]" />
                          Dashboard
                        </Link>
                        <Link
                          to="/claim"
                          onClick={() => setMenuOpen(false)}
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
                      onClick={() => setMenuOpen(false)}
                      className={cn(isActive('/settings') && 'is-active')}
                    >
                      <Settings className="h-4 w-4 text-[var(--min-muted)]" />
                      Settings
                    </Link>
                    <Link
                      to="/account"
                      onClick={() => setMenuOpen(false)}
                      className={cn(isActive('/account') && 'is-active')}
                    >
                      <User className="h-4 w-4 text-[var(--min-muted)]" />
                      My Account
                    </Link>
                  </div>

                  {isAuthenticated && (
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
                  )}
                </nav>
              </div>
            </div>
          </aside>
        </>
      )}
    </section>
  );
}
