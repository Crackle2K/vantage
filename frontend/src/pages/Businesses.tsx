import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader2, MapPin, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BusinessCard } from '@/components/business-card';
import { BusinessModal } from '@/components/BusinessModal';
import { CommunityActivityRail, type CommunityActivityItem } from '@/components/explore/CommunityActivityRail';
import { FilterBar } from '@/components/explore/FilterBar';
import type { Business } from '@/types';
import { api } from '@/api';

const CACHE_VERSION = 'v4';
const CACHE_TTL_MS = 30 * 60 * 1000;

const DEFAULT_LAT = 43.6532;
const DEFAULT_LNG = -79.3832;
const DEFAULT_RADIUS = 25;
const MIN_RADIUS = 1;
const MAX_RADIUS = 50;
const DISCOVERY_LIMIT = 300;

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=2000&q=80';

interface CacheEntry {
  data: Business[];
  ts: number;
}

interface UserLocation {
  latitude: number;
  longitude: number;
}

function cacheKey(lat: number, lng: number, radius: number): string {
  return `vantage:explore:${CACHE_VERSION}:${lat.toFixed(2)}:${lng.toFixed(2)}:${radius}`;
}

function getCached(key: string): Business[] | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;

    const cached: CacheEntry = JSON.parse(raw);
    if (Date.now() - cached.ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return cached.data;
  } catch {
    return null;
  }
}

function setCache(key: string, data: Business[]) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // ignore storage write issues
  }
}

function getBusinessId(business: Business): string {
  return business.id || business._id || business.name;
}

function isIndependent(business: Business): boolean {
  const typed = (business.business_type || '').toLowerCase();
  if (typed === 'independent') return true;
  return (business.local_confidence ?? 0) >= 0.75;
}

function hasVerifiedSignal(business: Business): boolean {
  return (business.checkins_today ?? 0) > 0 || !!business.last_verified_at || !!business.is_active_today;
}

function isActiveToday(business: Business): boolean {
  return !!business.is_active_today || (business.checkins_today ?? 0) > 0;
}

function formatRelativeTimestamp(timestamp?: string): string {
  if (!timestamp) return 'Updated today';

  const time = new Date(timestamp).getTime();
  if (!time) return 'Updated today';

  const diffMin = Math.max(1, Math.floor((Date.now() - time) / 60000));
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays} days ago`;
}

function confidenceRank(business: Business): number {
  const confidence = (business.local_confidence ?? 0) * 10;
  const activity = (business.checkins_today ?? 0) * 3 + (business.trending_score ?? 0);
  const claimBoost = business.is_claimed ? 2 : 0;
  const independentBoost = isIndependent(business) ? 3 : 0;
  return confidence + activity + claimBoost + independentBoost;
}

function trustReasons(business: Business): string[] {
  const reasons: string[] = [];

  const checkins = Math.max(0, business.checkins_today ?? business.verified_visits_today ?? 0);
  if (checkins > 0) {
    reasons.push(`${checkins} verified visits today`);
  }

  if ((business.trending_score ?? 0) >= 10 || (business.review_count ?? 0) >= 18) {
    reasons.push('High recent engagement');
  }

  if (business.is_claimed) {
    reasons.push('Claimed by owner');
  }

  if (isIndependent(business)) {
    reasons.push('Independent local business');
  }

  if (reasons.length === 0) {
    reasons.push('Recently active in the local community');
  }

  return reasons.slice(0, 3);
}

export default function Businesses() {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationLoading, setLocationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [favorites, setFavorites] = useState<string[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [independentOnly, setIndependentOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [claimedOnly, setClaimedOnly] = useState(false);
  const [activeTodayOnly, setActiveTodayOnly] = useState(false);

  const filtersRef = useRef<HTMLElement | null>(null);
  const radiusDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('vantage-favorites');
    if (saved) setFavorites(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('vantage-favorites', JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = (businessId: string) => {
    setFavorites((current) =>
      current.includes(businessId) ? current.filter((id) => id !== businessId) : [...current, businessId]
    );
  };

  const fetchBusinesses = useCallback(async (lat: number, lng: number, radiusValue: number, forceRefresh = false) => {
    const key = cacheKey(lat, lng, radiusValue);
    if (forceRefresh) sessionStorage.removeItem(key);

    const cached = getCached(key);
    if (!forceRefresh && cached && cached.length > 0) {
      setBusinesses(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const discovered = await api.discoverBusinesses(lat, lng, radiusValue, undefined, DISCOVERY_LIMIT, forceRefresh);
      setBusinesses(discovered);
      if (discovered.length > 0) setCache(key, discovered);
    } catch {
      try {
        const nearby = await api.getNearbyBusinesses(lat, lng, radiusValue);
        setBusinesses(nearby);
        if (nearby.length > 0) setCache(key, nearby);
      } catch {
        try {
          const fallback = await api.getBusinesses();
          setBusinesses(fallback);
        } catch (fetchError) {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to load businesses');
          setBusinesses([]);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBusinesses(DEFAULT_LAT, DEFAULT_LNG, DEFAULT_RADIUS);
  }, [fetchBusinesses]);

  const requestLocation = () => {
    setError(null);

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      return;
    }

    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setLocation(nextLocation);
        fetchBusinesses(nextLocation.latitude, nextLocation.longitude, radius, true);
        setLocationLoading(false);
      },
      () => {
        setLocationLoading(false);
        setError('We could not access your location. Showing businesses from the default area.');
      }
    );
  };

  const handleRadiusChange = (nextRadius: number) => {
    setRadius(nextRadius);

    if (radiusDebounceRef.current) window.clearTimeout(radiusDebounceRef.current);

    radiusDebounceRef.current = window.setTimeout(() => {
      const lat = location?.latitude ?? DEFAULT_LAT;
      const lng = location?.longitude ?? DEFAULT_LNG;
      fetchBusinesses(lat, lng, nextRadius, true);
    }, 220);
  };

  useEffect(() => {
    return () => {
      if (radiusDebounceRef.current) window.clearTimeout(radiusDebounceRef.current);
    };
  }, []);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { 'All Categories': businesses.length };
    businesses.forEach((business) => {
      const category = business.category || 'Other';
      counts[category] = (counts[category] || 0) + 1;
    });
    return counts;
  }, [businesses]);

  const categories = useMemo(
    () =>
      Object.entries(categoryCounts)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => {
          if (a.label === 'All Categories') return -1;
          if (b.label === 'All Categories') return 1;
          return b.count - a.count;
        })
        .slice(0, 10),
    [categoryCounts]
  );

  const filteredBusinesses = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return businesses
      .filter((business) => {
        if (selectedCategory !== 'All Categories' && business.category !== selectedCategory) return false;
        if (independentOnly && !isIndependent(business)) return false;
        if (verifiedOnly && !hasVerifiedSignal(business)) return false;
        if (claimedOnly && !business.is_claimed) return false;
        if (activeTodayOnly && !isActiveToday(business)) return false;

        if (!query) return true;

        const name = (business.name || '').toLowerCase();
        const category = (business.category || '').toLowerCase();
        const address = (business.address || '').toLowerCase();
        const description = (business.description || '').toLowerCase();
        return name.includes(query) || category.includes(query) || address.includes(query) || description.includes(query);
      })
      .sort((a, b) => confidenceRank(b) - confidenceRank(a));
  }, [
    businesses,
    searchQuery,
    selectedCategory,
    independentOnly,
    verifiedOnly,
    claimedOnly,
    activeTodayOnly,
  ]);

  const activityItems = useMemo<CommunityActivityItem[]>(() => {
    return businesses
      .filter((business) => hasVerifiedSignal(business) || isActiveToday(business))
      .sort((a, b) => {
        const aDate = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
        const bDate = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
        if (bDate !== aDate) return bDate - aDate;
        return confidenceRank(b) - confidenceRank(a);
      })
      .slice(0, 12)
      .map((business) => ({
        id: getBusinessId(business),
        name: business.name,
        category: business.category,
        timestamp: formatRelativeTimestamp(business.last_activity_at),
        summary: trustReasons(business)[0] || 'Community activity detected',
        imageUrl: business.image_url || business.image,
        secondary: `${Math.max(1, business.checkins_today ?? 0)} people verified`,
      }));
  }, [businesses]);

  const scrollToFilters = () => {
    filtersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="explore-page min-h-screen bg-[hsl(var(--background))] px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-[1400px] overflow-hidden rounded-[28px] border border-[hsl(var(--border))/0.8] bg-[hsl(var(--card))]">
        <section className="border-b border-[hsl(var(--border))/0.7] px-6 py-8 sm:px-10 sm:py-10">
          <p className="text-caption font-semibold uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">
            Trust first local discovery
          </p>
          <h1 className="mt-2 font-heading text-[42px] font-bold leading-tight text-[hsl(var(--foreground))] sm:text-[52px]">
            Explore trusted businesses near you
          </h1>
          <p className="mt-2 text-body text-[hsl(var(--muted-foreground))]">
            Ranked by real, recent community activity.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={requestLocation} disabled={locationLoading} className="rounded-full px-5">
              <Navigation className="h-4 w-4" />
              {locationLoading ? 'Locating...' : 'Use location'}
            </Button>
            <Button variant="outline" onClick={scrollToFilters} className="rounded-full px-5">
              Browse categories
            </Button>
          </div>

          <p className="mt-4 text-ui text-[hsl(var(--muted-foreground))]">
            {loading ? 'Loading businesses...' : `${filteredBusinesses.length} businesses in this view`}
          </p>

          <div className="relative mt-4 h-28 overflow-hidden rounded-xl border border-[hsl(var(--border))/0.7] sm:h-36">
            <img src={HERO_IMAGE} alt="Explore hero" className="h-full w-full object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--card))/0.9] to-transparent dark:from-[hsl(var(--card))/0.8]" />
            <div className="absolute inset-0 bg-[hsl(var(--background))/0.18] dark:bg-[hsl(var(--background))/0.36]" />
          </div>
        </section>

        <section className="border-b border-[hsl(var(--border))/0.7] bg-[hsl(var(--card))] px-6 py-6 sm:px-10">
          <CommunityActivityRail items={activityItems} />
        </section>

        <section ref={filtersRef} className="border-b border-[hsl(var(--border))/0.7] px-6 py-5 sm:px-10">
          <FilterBar
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            radius={radius}
            onRadiusChange={handleRadiusChange}
            minRadius={MIN_RADIUS}
            maxRadius={MAX_RADIUS}
            locationActive={!!location}
            loadingLocation={locationLoading}
            onUseLocation={requestLocation}
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            independentOnly={independentOnly}
            onToggleIndependent={() => setIndependentOnly((value) => !value)}
            verifiedOnly={verifiedOnly}
            onToggleVerified={() => setVerifiedOnly((value) => !value)}
            claimedOnly={claimedOnly}
            onToggleClaimed={() => setClaimedOnly((value) => !value)}
            activeTodayOnly={activeTodayOnly}
            onToggleActiveToday={() => setActiveTodayOnly((value) => !value)}
          />
        </section>

        <section className="px-6 py-6 sm:px-10">
          {error && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-error bg-error p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-error" />
              <div>
                <p className="text-ui font-semibold text-[hsl(var(--foreground))]">Notice</p>
                <p className="text-ui text-[hsl(var(--muted-foreground))]">{error}</p>
              </div>
            </div>
          )}

          {loading && (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="space-y-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                  <div className="skeleton h-44" />
                  <div className="skeleton h-4 w-2/3" />
                  <div className="skeleton h-3 w-1/2" />
                  <div className="skeleton h-10" />
                </div>
              ))}
            </div>
          )}

          {!loading && filteredBusinesses.length > 0 && (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {filteredBusinesses.map((business) => {
                const businessId = getBusinessId(business);
                return (
                  <BusinessCard
                    key={businessId}
                    business={business}
                    trustReasons={trustReasons(business)}
                    isFavorite={favorites.includes(businessId)}
                    onToggleFavorite={() => toggleFavorite(businessId)}
                    onViewDetails={() => setSelectedBusiness(business)}
                  />
                );
              })}
            </div>
          )}

          {!loading && filteredBusinesses.length === 0 && (
            <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--secondary))]">
                <MapPin className="h-5 w-5 text-[hsl(var(--muted-foreground))]" />
              </div>
              <h2 className="mt-4 text-subheading font-semibold text-[hsl(var(--foreground))]">
                No businesses match these filters
              </h2>
              <p className="mt-2 text-ui text-[hsl(var(--muted-foreground))]">
                Try a broader radius or clear some filters.
              </p>
            </section>
          )}
        </section>
      </div>

      {selectedBusiness && (
        <BusinessModal business={selectedBusiness} onClose={() => setSelectedBusiness(null)} />
      )}

      {loading && businesses.length === 0 && (
        <div className="fixed bottom-5 right-5 flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-ui text-[hsl(var(--muted-foreground))]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading
        </div>
      )}
    </div>
  );
}
