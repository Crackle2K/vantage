import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  MapPin, Loader2, AlertCircle, Navigation, Search, SlidersHorizontal, X,
  LayoutGrid, Rss, Star, Tag, ChevronUp, Heart, MessageCircle, Share2,
  Bookmark, Sparkles, TrendingUp, Store,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BusinessCard } from '@/components/business-card';
import { CategorySidebar } from '@/components/category-sidebar';
import { SearchBar } from '@/components/search-bar';
import { DealsSection } from '@/components/deals-section';
import { BusinessModal } from '@/components/BusinessModal';
import type { Business } from '@/types';
import { api } from '@/api';
import { cn } from '@/lib/utils';

// ─── Client-side cache ─────────────────────────────────────────────
// Stores API results in sessionStorage with a 30-min TTL so we don't
// re-fetch when the user navigates away and comes back.
// Increment CACHE_VERSION whenever the dataset or classifier changes
// to automatically invalidate all stored entries.
const CACHE_VERSION = 'v2';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry {
  data: Business[];
  ts: number;
}

function getCached(key: string): Business[] | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function setCache(key: string, data: Business[]) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // sessionStorage full — ignore
  }
}

function cacheKey(lat: number, lng: number, radius: number): string {
  return `vantage:biz:${CACHE_VERSION}:${lat.toFixed(2)}:${lng.toFixed(2)}:${radius}`;
}

// Default location (Toronto) for auto-loading local businesses.
// Use a large radius so ALL seeded businesses surface before the user
// enables their own GPS location.
const DEFAULT_LAT = 43.6532;
const DEFAULT_LNG = -79.3832;
const DEFAULT_RADIUS = 50;  // 50 km — covers the whole metro area

// ────────────────────────────────────────────────────────────────────

interface UserLocation {
  latitude: number;
  longitude: number;
}

export default function Businesses() {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [radius, setRadius] = useState<number>(DEFAULT_RADIUS);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true); // start true — auto-load
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [sortBy, setSortBy] = useState('recommended');
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'feed'>('grid');

  // Feed state
  const [feedCards, setFeedCards] = useState<number[]>([]);
  const [feedPage, setFeedPage] = useState(1);
  const [feedHasMore, setFeedHasMore] = useState(true);
  const [feedLoading, setFeedLoading] = useState(false);
  const feedSentinelRef = useRef<HTMLDivElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [feedSaved, setFeedSaved] = useState<Set<number>>(new Set());
  const [feedLiked, setFeedLiked] = useState<Set<number>>(new Set());
  const FEED_PAGE_SIZE = 6;

  // ─── LocalStorage: favorites ───────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('vantage-favorites');
    if (saved) setFavorites(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('vantage-favorites', JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = (id: string) => {
    setFavorites(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  // ─── Fetch businesses (with cache) ────────────────────────────
  const fetchBusinesses = useCallback(
    async (lat: number, lng: number, r: number, forceRefresh = false) => {
      // 1. Try cache first
      const key = cacheKey(lat, lng, r);
      if (forceRefresh) sessionStorage.removeItem(key);
      const cached = getCached(key);
      if (cached && cached.length > 0) {
        setBusinesses(cached);
        setLoading(false);
        return;
      }

      // 2. Hit the API
      setLoading(true);
      setError(null);
      try {
        const data = await api.discoverBusinesses(lat, lng, r);
        setBusinesses(data);
        if (data.length > 0) setCache(key, data);
      } catch {
        try {
          const data = await api.getNearbyBusinesses(lat, lng, r);
          setBusinesses(data);
          if (data.length > 0) setCache(key, data);
        } catch {
          try {
            const data = await api.getBusinesses();
            setBusinesses(data);
          } catch {
            setError('Failed to load businesses');
            setBusinesses([]);
          }
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // ─── Auto-load local businesses on mount ──────────────────────
  useEffect(() => {
    fetchBusinesses(DEFAULT_LAT, DEFAULT_LNG, DEFAULT_RADIUS);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Request user location ────────────────────────────────────
  const requestLocation = () => {
    setError(null);
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setLocation(loc);
        fetchBusinesses(loc.latitude, loc.longitude, radius);
      },
      (err) => {
        setLoading(false);
        const msgs: Record<number, string> = {
          1: 'Location access denied. Showing default area.',
          2: 'Location unavailable. Showing default area.',
          3: 'Location request timed out. Showing default area.',
        };
        setError(msgs[err.code] || 'Could not get location. Showing default area.');
      }
    );
  };

  // ─── Category filter (case-insensitive match) ─────────────────
  const filtered = useMemo(() => {
    return businesses
      .filter((b) => {
        // Category filter
        if (selectedCategory !== 'All Categories') {
          const bizCat = (b.category || '').toLowerCase();
          const selCat = selectedCategory.toLowerCase();
          if (bizCat !== selCat) return false;
        }
        // Search filter
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const nameMatch = (b.name || '').toLowerCase().includes(q);
          const descMatch = (b.description || '').toLowerCase().includes(q);
          const addrMatch = (b.address || '').toLowerCase().includes(q);
          if (!nameMatch && !descMatch && !addrMatch) return false;
        }
        return true;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'recommended': {
            // local_confidence > live_visibility_score > rating
            const confDiff = (b.local_confidence ?? 0) - (a.local_confidence ?? 0);
            if (confDiff !== 0) return confDiff;
            const vizDiff = (b.live_visibility_score ?? 0) - (a.live_visibility_score ?? 0);
            if (vizDiff !== 0) return vizDiff;
            return (b.rating ?? 0) - (a.rating ?? 0);
          }
          case 'rating':
            return (b.rating || 0) - (a.rating || 0);
          case 'reviews':
            return (b.review_count || 0) - (a.review_count || 0);
          case 'deals':
            return (b.has_deals ? 1 : 0) - (a.has_deals ? 1 : 0);
          case 'newest':
            return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
          default:
            return (b.local_confidence ?? 0) - (a.local_confidence ?? 0);
        }
      });
  }, [businesses, selectedCategory, searchQuery, sortBy]);

  // ─── Category counts for sidebar badges ───────────────────────
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    businesses.forEach((b) => {
      const cat = b.category || 'Other';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    counts['All Categories'] = businesses.length;
    return counts;
  }, [businesses]);

  // ─── Feed pagination ─────────────────────────────────────────
  const loadFeedPage = useCallback(
    (page: number, reset = false) => {
      setFeedLoading(true);
      const start = (page - 1) * FEED_PAGE_SIZE;
      const end = Math.min(start + FEED_PAGE_SIZE, filtered.length);
      const newIds = Array.from({ length: end - start }, (_, i) => start + i);
      setFeedCards((prev) => (reset ? newIds : [...prev, ...newIds]));
      setFeedHasMore(end < filtered.length);
      setFeedPage(page);
      setFeedLoading(false);
    },
    [FEED_PAGE_SIZE, filtered.length]
  );

  // Reset feed when filters / view change
  useEffect(() => {
    if (viewMode === 'feed') {
      setFeedCards([]);
      setFeedPage(1);
      setFeedHasMore(true);
      loadFeedPage(1, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, selectedCategory, searchQuery, sortBy]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    if (viewMode !== 'feed') return;
    const sentinel = feedSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && feedHasMore && !feedLoading) {
          loadFeedPage(feedPage + 1);
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [viewMode, feedHasMore, feedLoading, feedPage, loadFeedPage]);

  // Scroll-to-top visibility
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 600);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleRadiusChange = (r: number) => {
    setRadius(r);
    const lat = location?.latitude ?? DEFAULT_LAT;
    const lng = location?.longitude ?? DEFAULT_LNG;
    fetchBusinesses(lat, lng, r, true); // force fresh fetch — bypass cache
  };

  // ─── JSX ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[hsl(var(--primary))]/5 via-[hsl(var(--background))] to-[hsl(var(--primary))]/3 border-b border-[hsl(var(--border))]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--primary)/0.12),transparent)]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-xl bg-[hsl(var(--primary))]/10">
              <Store className="w-6 h-6 text-[hsl(var(--primary))]" />
            </div>
            <span className="text-xs font-semibold tracking-widest uppercase text-[hsl(var(--primary))]">
              Local Discovery
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[hsl(var(--foreground))] mb-3 tracking-tight">
            Explore Local Businesses
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] text-lg max-w-2xl">
            Discover, review, and support the best local businesses in your neighborhood
          </p>
          {/* Quick stats */}
          {businesses.length > 0 && (
            <div className="flex items-center gap-6 mt-6">
              <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                <TrendingUp className="w-4 h-4 text-[hsl(var(--primary))]" />
                <span><strong className="text-[hsl(var(--foreground))]">{businesses.length}</strong> local businesses</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span><strong className="text-[hsl(var(--foreground))]">
                  {Object.keys(categoryCounts).filter(k => k !== 'All Categories').length}
                </strong> categories</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* ── Toolbar ────────────────────────────────────────────── */}
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl p-4 mb-6 shadow-sm">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            {/* Left: Location & Radius */}
            <div className="flex items-center gap-3 flex-wrap">
              {!location ? (
                <Button
                  onClick={requestLocation}
                  disabled={loading}
                  variant="outline"
                  className="rounded-xl border-[hsl(var(--primary))]/30 text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/5"
                >
                  {loading && businesses.length === 0 ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading...</>
                  ) : (
                    <><Navigation className="w-4 h-4 mr-2" /> Use My Location</>
                  )}
                </Button>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-500/20 text-sm font-medium">
                  <MapPin className="w-3.5 h-3.5" />
                  Location Active
                </div>
              )}

              {/* Radius pills */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-[hsl(var(--muted-foreground))] font-medium">Radius:</span>
                <div className="flex rounded-lg overflow-hidden border border-[hsl(var(--border))]">
                  {[5, 10, 25, 50].map((r) => (
                    <button
                      key={r}
                      onClick={() => handleRadiusChange(r)}
                      className={cn(
                        'px-3 py-1.5 text-xs font-semibold transition-all',
                        radius === r
                          ? 'bg-[hsl(var(--primary))] text-white'
                          : 'bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]'
                      )}
                    >
                      {r}km
                      {radius === r && !loading && (
                        <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-white/20 text-[10px] font-bold">
                          {businesses.length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Search, Filters, View Toggle */}
            <div className="flex items-center gap-2 w-full lg:w-auto">
              <div className="relative flex-1 lg:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                <Input
                  placeholder="Search businesses..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 rounded-xl text-sm h-9"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                  >
                    <X className="w-4 h-4 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]" />
                  </button>
                )}
              </div>

              <button
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  'p-2 rounded-xl border transition-colors',
                  showFilters
                    ? 'bg-[hsl(var(--primary))] text-white border-transparent'
                    : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]'
                )}
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>

              {/* View toggle */}
              <div className="flex rounded-lg overflow-hidden border border-[hsl(var(--border))]">
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    'p-2 transition-colors',
                    viewMode === 'grid'
                      ? 'bg-[hsl(var(--primary))] text-white'
                      : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]'
                  )}
                  title="Grid View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('feed')}
                  className={cn(
                    'p-2 transition-colors',
                    viewMode === 'feed'
                      ? 'bg-[hsl(var(--primary))] text-white'
                      : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]'
                  )}
                  title="Feed View"
                >
                  <Rss className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Expandable sort controls */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-[hsl(var(--border))]">
              <SearchBar searchQuery="" onSearchChange={() => {}} sortBy={sortBy} onSortChange={setSortBy} />
            </div>
          )}

          {/* Results count */}
          {!loading && businesses.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[hsl(var(--border))] flex items-center justify-between">
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                {viewMode === 'grid' ? (
                  <>
                    Showing{' '}
                    <span className="font-semibold text-[hsl(var(--foreground))]">{filtered.length}</span>{' '}
                    {filtered.length !== businesses.length && (
                      <>of {businesses.length} </>
                    )}
                    local businesses
                    {selectedCategory !== 'All Categories' && (
                      <> in <span className="font-semibold text-[hsl(var(--primary))]">{selectedCategory}</span></>
                    )}
                  </>
                ) : (
                  <>
                    Scrolling through{' '}
                    <span className="font-semibold text-[hsl(var(--foreground))]">{feedCards.length}</span>{' '}
                    businesses
                  </>
                )}
              </p>
              {selectedCategory !== 'All Categories' && (
                <button
                  onClick={() => setSelectedCategory('All Categories')}
                  className="text-xs text-[hsl(var(--primary))] hover:underline font-medium"
                >
                  Clear filter
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Main Layout ─────────────────────────────────────────── */}
        <div className="flex gap-6">
          {/* Sidebar */}
          <div className="hidden lg:block">
            <CategorySidebar
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              businessCounts={categoryCounts}
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Deals */}
            <DealsSection />

            {/* Error */}
            {error && (
              <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-800 dark:text-red-300 text-sm">Notice</p>
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-14 h-14 rounded-2xl bg-[hsl(var(--primary))]/10 flex items-center justify-center mb-4">
                  <Loader2 className="w-7 h-7 text-[hsl(var(--primary))] animate-spin" />
                </div>
                <p className="text-[hsl(var(--muted-foreground))] font-medium text-sm">
                  Discovering local businesses...
                </p>
              </div>
            )}

            {/* ── Grid View ──────────────────────────────────────── */}
            {!loading && filtered.length > 0 && viewMode === 'grid' && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {filtered.map((business) => (
                  <BusinessCard
                    key={business.id || business._id}
                    business={business}
                    isFavorite={favorites.includes(business.id || business._id || '')}
                    onToggleFavorite={() => toggleFavorite(business.id || business._id || '')}
                    onViewDetails={() => setSelectedBusiness(business)}
                  />
                ))}
              </div>
            )}

            {/* ── Feed View ──────────────────────────────────────── */}
            {viewMode === 'feed' && (
              <div className="max-w-2xl mx-auto space-y-6">
                {feedCards.length === 0 && !feedLoading && (
                  <div className="text-center py-16">
                    <Rss className="w-12 h-12 text-[hsl(var(--muted-foreground))] mx-auto mb-4 opacity-40" />
                    <h3 className="text-lg font-semibold text-[hsl(var(--foreground))] mb-2">
                      Your feed is empty
                    </h3>
                    <p className="text-[hsl(var(--muted-foreground))] text-sm">
                      Try adjusting your filters or check back later
                    </p>
                  </div>
                )}

                {feedCards.map((cardId) => {
                  const liked = feedLiked.has(cardId);
                  const saved = feedSaved.has(cardId);
                  const biz = filtered[cardId];
                  if (!biz) return null;
                  const imageUrl = biz.image_url || biz.image || '';

                  return (
                    <div
                      key={cardId}
                      className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group"
                    >
                      {/* Header */}
                      <div className="flex items-center gap-3 px-5 py-4">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt=""
                            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[hsl(var(--secondary))] flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-bold text-[hsl(var(--muted-foreground))]">
                              {biz.name[0]}
                            </span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-[hsl(var(--foreground))] truncate">
                            {biz.name}
                          </p>
                          <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">
                            {biz.category} &middot; {biz.address || 'Local Business'}
                          </p>
                        </div>
                        {(biz.rating ?? 0) > 0 && (
                          <span className="flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 flex-shrink-0">
                            <Star className="w-3.5 h-3.5 fill-current" />
                            {(biz.rating ?? 0).toFixed(1)}
                          </span>
                        )}
                      </div>

                      {/* Image */}
                      <div
                        className="relative aspect-[4/3] overflow-hidden bg-[hsl(var(--secondary))] cursor-pointer"
                        onClick={() => setSelectedBusiness(biz)}
                      >
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={biz.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            loading="lazy"
                          />
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--primary))]/10 to-[hsl(var(--primary))]/5 flex items-center justify-center">
                            <Store className="w-16 h-16 text-[hsl(var(--muted-foreground))]/20" />
                          </div>
                        )}
                        {biz.has_deals && (
                          <div className="absolute top-4 right-4">
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold text-white bg-[hsl(var(--primary))] shadow-lg">
                              <Tag className="w-3 h-3" />
                              Deal
                            </span>
                          </div>
                        )}
                        {(biz.review_count ?? 0) > 0 && (
                          <div className="absolute bottom-4 left-4 flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm text-white text-xs font-medium">
                            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                            {(biz.rating ?? 0).toFixed(1)} &middot; {biz.review_count} reviews
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="px-5 py-3 flex items-center justify-between border-b border-[hsl(var(--border))]">
                        <div className="flex items-center gap-4">
                          <button
                            onClick={() =>
                              setFeedLiked((prev) => {
                                const next = new Set(prev);
                                next.has(cardId) ? next.delete(cardId) : next.add(cardId);
                                return next;
                              })
                            }
                            className="flex items-center gap-1.5 group/btn"
                          >
                            <Heart
                              className={cn(
                                'w-5 h-5 transition-transform',
                                liked
                                  ? 'text-red-500 fill-red-500 scale-110'
                                  : 'text-[hsl(var(--muted-foreground))] group-hover/btn:text-red-400'
                              )}
                            />
                            <span
                              className={cn(
                                'text-xs font-medium',
                                liked ? 'text-red-500' : 'text-[hsl(var(--muted-foreground))]'
                              )}
                            >
                              {liked ? 'Liked' : 'Like'}
                            </span>
                          </button>
                          <button className="flex items-center gap-1.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors">
                            <MessageCircle className="w-5 h-5" />
                            <span className="text-xs font-medium">Comment</span>
                          </button>
                          <button className="flex items-center gap-1.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors">
                            <Share2 className="w-5 h-5" />
                            <span className="text-xs font-medium">Share</span>
                          </button>
                        </div>
                        <button
                          onClick={() =>
                            setFeedSaved((prev) => {
                              const next = new Set(prev);
                              next.has(cardId) ? next.delete(cardId) : next.add(cardId);
                              return next;
                            })
                          }
                        >
                          <Bookmark
                            className={cn(
                              'w-5 h-5 transition-colors',
                              saved
                                ? 'text-[hsl(var(--primary))] fill-[hsl(var(--primary))]'
                                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]'
                            )}
                          />
                        </button>
                      </div>

                      {/* Description */}
                      <div className="px-5 py-4">
                        <p className="text-sm text-[hsl(var(--muted-foreground))] line-clamp-2">
                          {biz.description || 'A local business near you.'}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {/* Infinite scroll sentinel */}
                <div ref={feedSentinelRef} className="h-4" />

                {feedLoading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--primary))]" />
                    <span className="ml-2 text-sm text-[hsl(var(--muted-foreground))]">
                      Loading more...
                    </span>
                  </div>
                )}

                {!feedHasMore && feedCards.length > 0 && (
                  <div className="text-center py-10">
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">
                      You&apos;re all caught up!
                    </p>
                    <button
                      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                      className="mt-2 text-xs font-medium text-[hsl(var(--primary))] hover:underline"
                    >
                      Back to top
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* No results */}
            {!loading && filtered.length === 0 && businesses.length > 0 && viewMode === 'grid' && (
              <div className="text-center py-16">
                <Search className="w-12 h-12 text-[hsl(var(--muted-foreground))] mx-auto mb-4 opacity-40" />
                <h3 className="text-lg font-semibold text-[hsl(var(--foreground))] mb-2">
                  No matches found
                </h3>
                <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">
                  Try adjusting your filters or search query
                </p>
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('All Categories');
                  }}
                >
                  Clear Filters
                </Button>
              </div>
            )}

            {/* Empty state — no businesses at all */}
            {!loading && businesses.length === 0 && !error && (
              <div className="text-center py-20">
                <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--primary))]/10 flex items-center justify-center mx-auto mb-6">
                  <MapPin className="w-8 h-8 text-[hsl(var(--primary))]" />
                </div>
                <h2 className="text-xl font-bold text-[hsl(var(--foreground))] mb-3">
                  No Businesses Found
                </h2>
                <p className="text-[hsl(var(--muted-foreground))] mb-6 max-w-md mx-auto text-sm">
                  We couldn&apos;t find any businesses in this area. Try using your location or expanding the search radius.
                </p>
                <Button onClick={requestLocation} className="rounded-xl">
                  <Navigation className="w-4 h-4 mr-2" />
                  Use My Location
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scroll to top */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-50 w-11 h-11 rounded-full bg-[hsl(var(--primary))] text-white shadow-lg hover:scale-110 transition-transform flex items-center justify-center"
        >
          <ChevronUp className="w-5 h-5" />
        </button>
      )}

      {/* Business Modal */}
      {selectedBusiness && (
        <BusinessModal
          business={selectedBusiness}
          onClose={() => setSelectedBusiness(null)}
        />
      )}
    </div>
  );
}
