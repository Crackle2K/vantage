import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  MapPin, Loader2, AlertCircle, Navigation, Search, SlidersHorizontal, X,
  LayoutGrid, Rss, Tag, ChevronUp, Heart, MessageCircle, Share2,
  Bookmark, Sparkles, TrendingUp, Store, Flame, CheckCircle2, Users, ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BusinessCard } from '@/components/business-card';
import { SearchBar } from '@/components/search-bar';
import { DealsSection } from '@/components/deals-section';
import { BusinessModal } from '@/components/BusinessModal';
import type { Business } from '@/types';
import { api } from '@/api';
import { cn } from '@/lib/utils';

// --- Client-side cache ---------------------------------------------
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
    // sessionStorage full - ignore
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
const MIN_RADIUS = 1;
const MAX_RADIUS = 50;
const DISCOVERY_LIMIT = 300;
const RADIUS_MARKS = [1, 5, 10, 25, 50];
const DEFAULT_RADIUS = 50;

// --------------------------------------------------------------------

interface UserLocation {
  latitude: number;
  longitude: number;
}

type TrustLabel = 'High Trust' | 'Growing Trust' | 'New & Active' | 'Unverified';
type BusinessTypeLabel = 'independent' | 'chain' | 'unknown';

export default function Businesses() {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [radius, setRadius] = useState<number>(DEFAULT_RADIUS);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true); // start true - auto-load
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [sortBy, setSortBy] = useState('recommended');
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'feed'>('grid');
  const [prioritizeIndependent, setPrioritizeIndependent] = useState(true);
  const [showClaimedOnly, setShowClaimedOnly] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [tickerIndex, setTickerIndex] = useState(0);
  const [tickerPaused, setTickerPaused] = useState(false);

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
  const radiusDebounceRef = useRef<number | null>(null);

  // --- LocalStorage: favorites -----------------------------------
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

  // --- Fetch businesses (with cache) ----------------------------
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
        const data = await api.discoverBusinesses(lat, lng, r, undefined, DISCOVERY_LIMIT, forceRefresh);
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
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load businesses');
            setBusinesses([]);
          }
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // --- Auto-load local businesses on mount ----------------------
  useEffect(() => {
    fetchBusinesses(DEFAULT_LAT, DEFAULT_LNG, DEFAULT_RADIUS);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Request user location ------------------------------------
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

  // --- Category filter (case-insensitive match) -----------------
  const strategicScore = useCallback((business: Business): number => {
    const lvs = business.live_visibility_score ?? 0;
    const local = Math.max(0, Math.min(business.local_confidence ?? 0, 1)) * 100;
    const reviews = business.review_count ?? 0;
    const freshness = Math.max(0, 1 - Math.min(reviews, 40) / 40) * 100;
    return 0.60 * lvs + 0.25 * local + 0.15 * freshness;
  }, []);

  const trustScore = useCallback(
    (business: Business): number => {
      return Math.round(Math.max(20, Math.min(100, strategicScore(business))));
    },
    [strategicScore]
  );

  const businessType = useCallback((business: Business): BusinessTypeLabel => {
    const typed = ((business as unknown as { business_type?: string }).business_type || '').toLowerCase();
    if (typed === 'independent' || typed === 'chain' || typed === 'unknown') return typed;
    const confidence = business.local_confidence ?? 0;
    if (confidence >= 0.78) return 'independent';
    if (confidence <= 0.35) return 'chain';
    return 'unknown';
  }, []);

  const hasVerifiedActivity = useCallback((business: Business): boolean => {
    return (business.checkins_today ?? 0) > 0 || !!business.is_active_today;
  }, []);

  const trustLabel = useCallback(
    (business: Business): TrustLabel => {
      const score = trustScore(business);
      if (!hasVerifiedActivity(business)) return 'Unverified';
      if (score >= 85) return 'High Trust';
      if (score >= 60) return 'Growing Trust';
      return 'New & Active';
    },
    [trustScore, hasVerifiedActivity]
  );

  const trustTone = useCallback((label: TrustLabel): string => {
    switch (label) {
      case 'High Trust':
        return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
      case 'Growing Trust':
        return 'border-cyan-400/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300';
      case 'New & Active':
        return 'border-amber-400/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
      default:
        return 'border-[hsl(var(--border))] bg-[hsl(var(--secondary))/0.7] text-[hsl(var(--muted-foreground))]';
    }
  }, []);

  const reasonChips = useCallback(
    (business: Business): string[] => {
      const reasons: string[] = [];
      const score = trustScore(business);
      const recent =
        business.last_activity_at &&
        (Date.now() - new Date(business.last_activity_at).getTime()) / 86400000 <= 7;
      if (hasVerifiedActivity(business)) reasons.push('Active today');
      if (recent) reasons.push('Recently verified');
      if (score >= 85) reasons.push('High community trust');
      if ((business.trending_score ?? 0) >= 18) reasons.push('Rising locally');
      return reasons.slice(0, 2);
    },
    [hasVerifiedActivity, trustScore]
  );

  const filtered = useMemo(() => {
    return businesses
      .filter((b) => {
        if (showClaimedOnly && !b.is_claimed) return false;
        if (activeOnly && !hasVerifiedActivity(b)) return false;
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
        const independentBoost = (biz: Business) =>
          prioritizeIndependent && businessType(biz) === 'independent' ? 8 : 0;
        switch (sortBy) {
          case 'recommended': {
            const strategyDiff =
              strategicScore(b) + independentBoost(b) - (strategicScore(a) + independentBoost(a));
            if (strategyDiff !== 0) return strategyDiff;
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
            return (
              (b.local_confidence ?? 0) +
              independentBoost(b) / 100 -
              ((a.local_confidence ?? 0) + independentBoost(a) / 100)
            );
        }
      });
  }, [
    businesses,
    selectedCategory,
    searchQuery,
    sortBy,
    strategicScore,
    showClaimedOnly,
    activeOnly,
    hasVerifiedActivity,
    prioritizeIndependent,
    businessType,
  ]);

  // --- Category counts for sidebar badges -----------------------
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    businesses.forEach((b) => {
      const cat = b.category || 'Other';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    counts['All Categories'] = businesses.length;
    return counts;
  }, [businesses]);

  const activeNearYou = useMemo(() => {
    const ranked = [...businesses].sort((a, b) => {
      const aActive = (a.checkins_today ?? 0) + (a.is_active_today ? 5 : 0) + (a.trending_score ?? 0);
      const bActive = (b.checkins_today ?? 0) + (b.is_active_today ? 5 : 0) + (b.trending_score ?? 0);
      if (bActive !== aActive) return bActive - aActive;
      return strategicScore(b) - strategicScore(a);
    });
    return ranked.slice(0, 8);
  }, [businesses, strategicScore]);

  const claimedFeatured = useMemo(() => {
    return businesses
      .filter((b) => b.is_claimed && hasVerifiedActivity(b))
      .sort((a, b) => strategicScore(b) - strategicScore(a))
      .slice(0, 8);
  }, [businesses, hasVerifiedActivity, strategicScore]);

  const topCategories = useMemo(() => {
    return Object.entries(categoryCounts)
      .filter(([cat]) => cat !== 'All Categories')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [categoryCounts]);

  const livePulse = useMemo(() => {
    const events = [...businesses]
      .filter((biz) => hasVerifiedActivity(biz))
      .sort((a, b) => {
        const ad = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
        const bd = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
        return bd - ad;
      })
      .slice(0, 20);
    return events.map((biz, idx) => {
      let minutes = 2 + idx * 3;
      if (biz.last_activity_at) {
        const diff = Math.floor((Date.now() - new Date(biz.last_activity_at).getTime()) / 60000);
        if (diff >= 0) minutes = Math.max(1, diff);
      }
      return `Verified visit • ${biz.name} • ${minutes} min ago`;
    });
  }, [businesses, hasVerifiedActivity]);

  useEffect(() => {
    if (!livePulse.length || tickerPaused) return;
    const id = window.setInterval(() => {
      setTickerIndex((prev) => (prev + 1) % livePulse.length);
    }, 2600);
    return () => window.clearInterval(id);
  }, [livePulse, tickerPaused]);

  // --- Feed pagination -----------------------------------------
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
    if (radiusDebounceRef.current) {
      window.clearTimeout(radiusDebounceRef.current);
    }
    radiusDebounceRef.current = window.setTimeout(() => {
      const lat = location?.latitude ?? DEFAULT_LAT;
      const lng = location?.longitude ?? DEFAULT_LNG;
      fetchBusinesses(lat, lng, r, true);
    }, 250);
  };

  useEffect(() => {
    return () => {
      if (radiusDebounceRef.current) window.clearTimeout(radiusDebounceRef.current);
    };
  }, []);

  // --- JSX ------------------------------------------------------
  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(var(--background))] via-emerald-500/5 to-cyan-500/5">
      {/* -- Hero --------------------------------------------------- */}
      <div className="relative overflow-hidden border-b border-[hsl(var(--border))]/70 bg-gradient-to-br from-emerald-500/10 via-[hsl(var(--background))] to-cyan-500/10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--primary)/0.18),transparent)]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8 items-start">
            <div className="lg:col-span-3">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-xl bg-white/70 backdrop-blur border border-white/50 shadow-sm">
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
                Calmer discovery, smarter ranking, and a feed designed to spotlight trusted local gems.
              </p>
              {businesses.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 mt-6">
                  <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] px-3 py-2 rounded-xl bg-white/70 backdrop-blur border border-white/60">
                    <TrendingUp className="w-4 h-4 text-[hsl(var(--primary))]" />
                    <span><strong className="text-[hsl(var(--foreground))]">{businesses.length >= DISCOVERY_LIMIT ? `${DISCOVERY_LIMIT}+` : businesses.length}</strong> local businesses</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] px-3 py-2 rounded-xl bg-white/70 backdrop-blur border border-white/60">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span><strong className="text-[hsl(var(--foreground))]">
                      {Object.keys(categoryCounts).filter(k => k !== 'All Categories').length}
                    </strong> categories</span>
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-2 rounded-2xl border border-emerald-400/20 bg-[hsl(var(--card))/0.82] backdrop-blur p-5 shadow-sm">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-emerald-600 mb-3">
                Why You&apos;re Seeing This
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  <Flame className="w-3 h-3" />
                  Active today
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-700 dark:text-cyan-300">
                  <CheckCircle2 className="w-3 h-3" />
                  Recently verified
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                  <Users className="w-3 h-3" />
                  High community trust
                </span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                We prioritize trustworthy local momentum while still giving emerging businesses visibility.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {livePulse.length > 0 && (
          <div
            className="mb-5 rounded-xl bg-[hsl(var(--card))/0.7] px-3 py-2 overflow-hidden border border-[hsl(var(--border))/0.5]"
            onMouseEnter={() => setTickerPaused(true)}
            onMouseLeave={() => setTickerPaused(false)}
          >
            <div className="flex items-center gap-3 whitespace-nowrap">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--primary))]">Live Community</span>
              <span className="text-xs text-[hsl(var(--muted-foreground))]">{livePulse[tickerIndex]}</span>
            </div>
          </div>
        )}

        {!loading && claimedFeatured.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">Verified & Claimed Businesses</h2>
              <button
                onClick={() => setShowClaimedOnly((p) => !p)}
                className="text-xs text-[hsl(var(--primary))] hover:underline"
              >
                {showClaimedOnly ? 'Show all' : 'Show claimed only'}
              </button>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {claimedFeatured.map((biz) => (
                <button
                  key={`claimed-${biz.id || biz._id}`}
                  onClick={() => setSelectedBusiness(biz)}
                  className="min-w-[240px] rounded-xl bg-[hsl(var(--card))/0.78] px-3 py-3 text-left border border-[hsl(var(--border))/0.6]"
                >
                  <p className="text-sm font-semibold text-[hsl(var(--foreground))] truncate">{biz.name}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                    {biz.category}
                    {biz.distance !== undefined ? ` • ${biz.distance.toFixed(1)} km` : ''}
                  </p>
                  <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
                    Claimed • {Math.max(1, biz.checkins_today ?? 0)} verified visits today
                  </p>
                  <p
                    title="Based on verified visits, credibility-weighted reviews, and recent activity."
                    className="mt-1 text-xs text-[hsl(var(--foreground))] font-medium"
                  >
                    Trust: {trustScore(biz)}/100 • {trustLabel(biz)}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-[hsl(var(--secondary))] px-2 py-1 text-[10px] text-[hsl(var(--muted-foreground))]">
                      View
                    </span>
                    <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-700 dark:text-emerald-300">
                      Check in
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        {!loading && activeNearYou.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-[hsl(var(--foreground))] flex items-center gap-2">
                <Flame className="w-4 h-4 text-emerald-500" />
                Active near you today
              </h2>
              <button
                onClick={() => setActiveOnly(true)}
                className="text-xs text-[hsl(var(--primary))] hover:underline"
              >
                See all active
              </button>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {activeNearYou.map((biz) => (
                <button
                  key={`active-${biz.id || biz._id}`}
                  onClick={() => setSelectedBusiness(biz)}
                  className="min-w-[240px] max-w-[240px] text-left rounded-xl border border-[hsl(var(--border))]/70 bg-[hsl(var(--card))/0.84] backdrop-blur p-3 hover:border-[hsl(var(--primary))]/40 transition-colors"
                >
                  <p className="font-semibold text-sm text-[hsl(var(--foreground))] truncate">{biz.name}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5 truncate">
                    {biz.category}
                    {biz.distance !== undefined ? ` • ${biz.distance.toFixed(1)} km` : ''}
                  </p>
                  <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-300 font-medium">
                    {Math.max(1, biz.checkins_today ?? 0)} verified visits today
                  </p>
                  <p
                    title="Based on verified visits, credibility-weighted reviews, and recent activity."
                    className="mt-1 text-xs text-[hsl(var(--foreground))] font-medium"
                  >
                    Trust: {trustScore(biz)}/100 • {trustLabel(biz)}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-[hsl(var(--secondary))] px-2 py-1 text-[10px] text-[hsl(var(--muted-foreground))]">
                      View
                    </span>
                    <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-700 dark:text-emerald-300">
                      Check in
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* -- Toolbar ---------------------------------------------- */}
        <div className="bg-[hsl(var(--card))/0.6] backdrop-blur rounded-2xl p-4 mb-8">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            {/* Left: Location & Radius */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full lg:w-auto">
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

              {/* Radius slider */}
              <div className="min-w-0 sm:min-w-[280px] w-full sm:w-[320px] px-3 py-2 rounded-xl bg-[hsl(var(--background))/0.65]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-[hsl(var(--muted-foreground))] font-medium uppercase tracking-wide">Radius</span>
                  <span className="text-sm font-semibold text-[hsl(var(--foreground))]">{radius} km</span>
                </div>
                <input
                  type="range"
                  min={MIN_RADIUS}
                  max={MAX_RADIUS}
                  step={1}
                  value={radius}
                  onChange={(e) => handleRadiusChange(Number(e.target.value))}
                  className="w-full h-2 rounded-lg bg-[hsl(var(--secondary))] cursor-pointer"
                  style={{ accentColor: 'hsl(var(--primary))' }}
                  aria-label="Search radius in kilometers"
                />
                <div className="mt-1.5 flex items-center justify-between">
                  {RADIUS_MARKS.map((mark) => (
                    <button
                      key={mark}
                      onClick={() => handleRadiusChange(mark)}
                      className={cn(
                        'text-[10px] font-medium transition-colors',
                        radius === mark
                          ? 'text-[hsl(var(--primary))]'
                          : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                      )}
                    >
                      {mark}km
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {/* Right: Search, Filters, View Toggle */}
            <div className="flex items-center gap-2 w-full lg:w-auto lg:ml-auto">
              <div className="relative flex-1 lg:w-[430px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                <Input
                  placeholder="Search businesses..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 rounded-xl text-sm h-11"
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
                  'p-2 rounded-xl border border-[hsl(var(--border))/0.7] transition-colors',
                  showFilters
                    ? 'bg-[hsl(var(--primary))] text-white border-transparent'
                    : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]'
                )}
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>

              {/* View toggle */}
              <div className="flex rounded-lg overflow-hidden border border-[hsl(var(--border))/0.7]">
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

          {topCategories.length > 0 && (
            <div className="mt-5 flex items-center gap-2 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setSelectedCategory('All Categories')}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap',
                  selectedCategory === 'All Categories'
                    ? 'bg-[hsl(var(--primary))] text-white border-transparent'
                    : 'bg-[hsl(var(--background))/0.7] text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))]'
                )}
              >
                All
              </button>
              {topCategories.map(([cat, count]) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap',
                    selectedCategory === cat
                      ? 'bg-[hsl(var(--primary))] text-white border-transparent'
                      : 'bg-[hsl(var(--background))/0.7] text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))]'
                  )}
                >
                  {cat} <span className="opacity-80">{count}</span>
                </button>
              ))}
              <button
                onClick={() => setPrioritizeIndependent((p) => !p)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap',
                  prioritizeIndependent
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-400/40'
                    : 'bg-[hsl(var(--background))/0.7] text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))]'
                )}
              >
                Prioritize Independent
              </button>
              <button
                onClick={() => setActiveOnly((p) => !p)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap',
                  activeOnly
                    ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-400/40'
                    : 'bg-[hsl(var(--background))/0.7] text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))]'
                )}
              >
                Active today
              </button>
              <button
                onClick={() => setShowClaimedOnly((p) => !p)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap',
                  showClaimedOnly
                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-400/40'
                    : 'bg-[hsl(var(--background))/0.7] text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))]'
                )}
              >
                Claimed only
              </button>
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

        {/* -- Main Layout ------------------------------------------- */}
        <div>
          {/* Content */}
          <div className="min-w-0">
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
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 py-4">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div key={`skeleton-${idx}`} className="rounded-2xl border border-[hsl(var(--border))/0.7] bg-[hsl(var(--card))/0.65] p-4">
                    <div className="h-40 rounded-xl bg-gradient-to-r from-[hsl(var(--secondary))/0.7] via-[hsl(var(--secondary))/0.45] to-[hsl(var(--secondary))/0.7] animate-pulse" />
                    <div className="mt-4 h-4 w-2/3 rounded bg-[hsl(var(--secondary))/0.9] animate-pulse" />
                    <div className="mt-2 h-3 w-1/2 rounded bg-[hsl(var(--secondary))/0.75] animate-pulse" />
                    <div className="mt-4 flex gap-2">
                      <div className="h-6 w-24 rounded-full bg-[hsl(var(--secondary))/0.8] animate-pulse" />
                      <div className="h-6 w-20 rounded-full bg-[hsl(var(--secondary))/0.8] animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* -- Grid View ---------------------------------------- */}
            {!loading && filtered.length > 0 && viewMode === 'grid' && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {filtered.map((business) => (
                  <div key={business.id || business._id} className="space-y-2">
                    <BusinessCard
                      business={business}
                      isFavorite={favorites.includes(business.id || business._id || '')}
                      onToggleFavorite={() => toggleFavorite(business.id || business._id || '')}
                      onViewDetails={() => setSelectedBusiness(business)}
                    />
                    <div className="px-1 flex flex-wrap items-center gap-2 text-[11px]">
                      {business.is_claimed && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2.5 py-1">
                          <ShieldCheck className="w-3 h-3" />
                          Claimed
                        </span>
                      )}
                      <span
                        title="Based on verified visits, credibility-weighted reviews, and recent activity."
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1',
                          trustTone(trustLabel(business))
                        )}
                      >
                        Trust: {trustScore(business)}/100 • {trustLabel(business)}
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1',
                          businessType(business) === 'independent'
                            ? 'border-emerald-400/35 text-emerald-700 dark:text-emerald-300'
                            : businessType(business) === 'chain'
                            ? 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]'
                            : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]/80'
                        )}
                      >
                        {businessType(business) === 'independent'
                          ? 'Independent'
                          : businessType(business) === 'chain'
                          ? 'Chain'
                          : 'Unverified type'}
                      </span>
                      {reasonChips(business).map((reason) => (
                        <span
                          key={`${business.id || business._id}-${reason}`}
                          className="inline-flex items-center rounded-full bg-[hsl(var(--secondary))] px-2.5 py-1 text-[hsl(var(--muted-foreground))]"
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* -- Feed View ---------------------------------------- */}
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
                        <span
                          title="Based on verified visits, credibility-weighted reviews, and recent activity."
                          className={cn(
                            'text-[11px] font-semibold rounded-full border px-2 py-1 flex-shrink-0',
                            trustTone(trustLabel(biz))
                          )}
                        >
                          {trustLabel(biz)}
                        </span>
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
                        <div className="absolute bottom-4 left-4 flex items-center gap-2">
                          <span
                            className={cn(
                              'px-2.5 py-1 rounded-full border text-[11px] backdrop-blur-sm bg-[hsl(var(--background))/0.72]',
                              businessType(biz) === 'independent'
                                ? 'border-emerald-400/35 text-emerald-700 dark:text-emerald-300'
                                : businessType(biz) === 'chain'
                                ? 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]'
                                : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]/80'
                            )}
                          >
                            {businessType(biz) === 'independent'
                              ? 'Independent'
                              : businessType(biz) === 'chain'
                              ? 'Chain'
                              : 'Unverified type'}
                          </span>
                          {biz.is_claimed && (
                            <span className="px-2.5 py-1 rounded-full border border-emerald-400/35 text-[11px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                              Claimed
                            </span>
                          )}
                        </div>
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

            {/* Empty state - no businesses at all */}
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




