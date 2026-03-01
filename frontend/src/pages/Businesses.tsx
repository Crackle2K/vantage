import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ChevronDown, Loader2, MapPin, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BusinessCard } from '@/components/business-card';
import { BusinessModal } from '@/components/BusinessModal';
import { StickySearchFilters } from '@/components/explore/StickySearchFilters';
import { FiltersModal } from '@/components/explore/FiltersPopup';
import { OwnerEventCard } from '@/components/explore/OwnerEventCard';
import { PreferenceOnboardingModal } from '@/components/preferences/PreferenceOnboardingModal';
import { useSavedBusinesses } from '@/hooks/useSavedBusinesses';
import type { Business, ExploreLane, ExploreSortMode, OwnerEvent, User } from '@/types';
import { api } from '@/api';
import { useAuth } from '@/contexts/AuthContext';

const CACHE_VERSION = 'v5';
const CACHE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_LAT = 43.6532;
const DEFAULT_LNG = -79.3832;
const DEFAULT_RADIUS = 8;
const MIN_RADIUS = 1;
const MAX_RADIUS = 50;
const DISCOVERY_LIMIT = 300;
const LANE_PREVIEW_COUNT = 16;
const INITIAL_VISIBLE_COUNT = 36;
const LOAD_MORE_COUNT = 12;

interface CacheEntry {
  businesses: Business[];
  lanes: ExploreLane[];
  ts: number;
}

interface UserLocation {
  latitude: number;
  longitude: number;
}

function cacheKey(lat: number, lng: number, radius: number, sortMode: ExploreSortMode) {
  return `vantage:explore:${CACHE_VERSION}:${lat.toFixed(2)}:${lng.toFixed(2)}:${radius}:${sortMode}`;
}

function getCached(key: string): CacheEntry | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const cached = JSON.parse(raw) as Partial<CacheEntry>;
    if (!Array.isArray(cached.businesses) || !Array.isArray(cached.lanes) || typeof cached.ts !== 'number') {
      sessionStorage.removeItem(key);
      return null;
    }
    if (Date.now() - cached.ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return cached as CacheEntry;
  } catch {
    return null;
  }
}

function setCache(key: string, businesses: Business[], lanes: ExploreLane[]) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ businesses, lanes, ts: Date.now() }));
  } catch {
    
  }
}

function getBusinessId(business: Business) {
  return business.id || business._id || business.name;
}

function isIndependent(business: Business) {
  return (business.business_type || '').toLowerCase() === 'independent' || (business.local_confidence ?? 0) >= 0.75;
}

function hasVerifiedSignal(business: Business) {
  return (business.checkins_today ?? 0) > 0 || !!business.last_verified_at || !!business.is_active_today;
}

function isActiveToday(business: Business) {
  return !!business.is_active_today || (business.checkins_today ?? 0) > 0;
}

function laneTitleForSort(sortMode: ExploreSortMode) {
  switch (sortMode) {
    case 'distance': return { title: 'Nearby Now', subtitle: 'Sorted by distance' };
    case 'newest': return { title: 'Fresh Additions', subtitle: 'Newest listings first' };
    case 'most_reviewed': return { title: 'Most Reviewed', subtitle: 'Sorted by review volume' };
    default: return { title: 'Explore', subtitle: 'Trust-ranked for your area' };
  }
}

function buildBrowseLane(items: Business[]): ExploreLane {
  return {
    id: 'all',
    title: 'Browse All',
    subtitle: 'Canonical trust-ranked nearby',
    items,
  };
}

const CATEGORY_TAG_HINTS: Record<string, string[]> = {
  'Restaurants': ['Dining', 'Local Favorite', 'Date Night'],
  'Cafes & Coffee': ['Coffee', 'Brunch', 'Study Spot'],
  'Bars & Nightlife': ['Cocktails', 'Late Night', 'Social'],
  'Shopping': ['Boutique', 'Giftable', 'Trending'],
  'Fitness & Wellness': ['Wellness', 'Workout', 'Recovery'],
  'Beauty & Spas': ['Self Care', 'Beauty', 'Relaxing'],
  'Health & Medical': ['Trusted Care', 'Appointments', 'Local Essential'],
  'Financial Services': ['Professional', 'Advisory', 'Appointments'],
  'Automotive': ['Repair', 'Service', 'Reliable'],
  'Entertainment': ['Fun', 'Group Spot', 'Experience'],
  'Hotels & Travel': ['Stay', 'Travel', 'Convenient'],
  'Professional Services': ['Professional', 'Appointments', 'Trusted'],
  'Home Services': ['Home Care', 'Reliable', 'Trusted Service'],
  'Pets': ['Pet Friendly', 'Care', 'Local Favorite'],
  'Education': ['Learning', 'Family', 'Trusted'],
  'Grocery': ['Essentials', 'Fresh', 'Convenient'],
  'Local Services': ['Community', 'Reliable', 'Everyday'],
  'Active Life': ['Outdoor', 'Active', 'Weekend'],
  'food': ['Dining', 'Local Favorite', 'Quick Bite'],
  'retail': ['Shopping', 'Giftable', 'Trending'],
  'services': ['Professional', 'Reliable', 'Local Essential'],
  'entertainment': ['Fun', 'Experience', 'Social'],
  'health': ['Wellness', 'Care', 'Trusted'],
};

function normalizeTagLabel(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function deriveBusinessTags(business: Business) {
  const tags = new Set<string>();
  (business.known_for ?? []).forEach((tag) => {
    const normalized = normalizeTagLabel(tag);
    if (normalized) tags.add(normalized);
  });
  const category = business.category || 'Other';
  const normalizedCategory = normalizeTagLabel(category);
  if (normalizedCategory && normalizedCategory !== 'Other') {
    tags.add(normalizedCategory);
  }
  (CATEGORY_TAG_HINTS[category] ?? []).forEach((tag) => tags.add(tag));
  if (isIndependent(business)) tags.add('Independent');
  if (business.is_claimed) tags.add('Claimed');
  if (hasVerifiedSignal(business)) tags.add('Verified');
  if (isActiveToday(business)) tags.add('Live Now');
  if (business.has_deals) tags.add('Deals');
  return Array.from(tags).slice(0, 8);
}

function matchesFilters(
  business: Business,
  searchQuery: string,
  selectedCategory: string,
  selectedTagFilters: string[],
  businessTags: string[]
) {
  if (selectedCategory !== 'All Categories' && business.category !== selectedCategory) return false;
  if (selectedTagFilters.length > 0 && !selectedTagFilters.some((tag) => businessTags.includes(tag))) return false;
  const query = searchQuery.trim().toLowerCase();
  if (!query) return true;
  const haystack = [
    business.name,
    business.category,
    business.address,
    business.short_description || business.description,
    businessTags.join(' '),
  ].join(' ').toLowerCase();
  return haystack.includes(query);
}

function updateBusinessInLanes(currentLanes: ExploreLane[], updatedBusiness: Business) {
  const updatedId = getBusinessId(updatedBusiness);
  return currentLanes.map((lane) => ({
    ...lane,
    items: lane.items.map((business) => (getBusinessId(business) === updatedId ? updatedBusiness : business)),
  }));
}

export default function Businesses() {
  const { user, setUser } = useAuth();
  const { savedIds, toggleSaved } = useSavedBusinesses();
  const viewMode = 'grid' as const;
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [lanes, setLanes] = useState<ExploreLane[]>([]);
  const [ownerEvents, setOwnerEvents] = useState<OwnerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationLoading, setLocationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [selectedLaneId, setSelectedLaneId] = useState<string | null>(null);
  const [showPreferenceOnboarding, setShowPreferenceOnboarding] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode] = useState<ExploreSortMode>('canonical');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [selectedTagFilters, setSelectedTagFilters] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const radiusDebounceRef = useRef<number | null>(null);
  const businessModalScrollRef = useRef(0);
  const laneOverlayScrollRef = useRef(0);
  const didAutoLocateRef = useRef(false);

  useEffect(() => {
    setShowPreferenceOnboarding(!!user && !user.preferences_completed);
  }, [user]);

  useEffect(() => {
    const debounceHandle = window.setTimeout(() => {
      setSearchQuery(searchInput);
    }, 220);

    return () => window.clearTimeout(debounceHandle);
  }, [searchInput]);

  const fetchOwnerEvents = useCallback(async (lat: number, lng: number, radiusValue: number) => {
    try {
      const events = await api.getOwnerEvents({ lat, lng, radius: radiusValue, limit: 12 });
      setOwnerEvents(events);
    } catch {
      setOwnerEvents([]);
    }
  }, []);

  const fetchExploreData = useCallback(async (lat: number, lng: number, radiusValue: number, forceRefresh = false, requestedSortMode: ExploreSortMode = 'canonical') => {
    const key = cacheKey(lat, lng, radiusValue, requestedSortMode);
    if (forceRefresh) sessionStorage.removeItem(key);
    void fetchOwnerEvents(lat, lng, radiusValue);
    const cached = getCached(key);
    if (!forceRefresh && cached && (cached.businesses.length > 0 || cached.lanes.length > 0)) {
      setBusinesses(cached.businesses);
      setLanes(cached.lanes);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const sortLane = laneTitleForSort(requestedSortMode);
    try {
      let nextBusinesses: Business[] = [];
      let nextLanes: ExploreLane[] = [];
      if (requestedSortMode === 'canonical') {
        nextBusinesses = await api.discoverBusinesses(lat, lng, radiusValue, undefined, DISCOVERY_LIMIT, forceRefresh, 'canonical');
        const canonicalLane = buildBrowseLane(nextBusinesses);
        nextLanes = [canonicalLane];

        try {
          const laneResponse = await api.getExploreLanes(lat, lng, radiusValue, DISCOVERY_LIMIT);
          const personalizedLanes = (laneResponse.lanes ?? []).filter((lane) => lane.items.length > 0);
          nextLanes = [canonicalLane, ...personalizedLanes];
        } catch {
          
        }
      } else {
        nextBusinesses = await api.discoverBusinesses(lat, lng, radiusValue, undefined, DISCOVERY_LIMIT, forceRefresh, requestedSortMode);
        nextLanes = [{ id: requestedSortMode, title: sortLane.title, subtitle: sortLane.subtitle, items: nextBusinesses }];
      }
      setBusinesses(nextBusinesses);
      setLanes(nextLanes);
      setCache(key, nextBusinesses, nextLanes);
    } catch {
      try {
        const fallback = await api.getNearbyBusinesses(lat, lng, radiusValue);
        const fallbackLanes = requestedSortMode === 'canonical'
          ? [buildBrowseLane(fallback)]
          : [{ id: requestedSortMode, title: sortLane.title, subtitle: sortLane.subtitle, items: fallback }];
        setBusinesses(fallback);
        setLanes(fallbackLanes);
        setCache(key, fallback, fallbackLanes);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load nearby businesses');
        setBusinesses([]);
        setLanes([]);
      }
    } finally {
      setLoading(false);
    }
  }, [fetchOwnerEvents]);

  useEffect(() => {
    fetchExploreData(DEFAULT_LAT, DEFAULT_LNG, DEFAULT_RADIUS, false, 'canonical');
  }, [fetchExploreData]);

  useEffect(() => {
    if (didAutoLocateRef.current || typeof window === 'undefined') {
      return;
    }
    if (!navigator.geolocation) {
      didAutoLocateRef.current = true;
      return;
    }
    didAutoLocateRef.current = true;
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setLocation(nextLocation);
        fetchExploreData(nextLocation.latitude, nextLocation.longitude, radius, true, 'canonical');
        setLocationLoading(false);
      },
      () => {
        setLocationLoading(false);
      }
    );
  }, [fetchExploreData, radius]);

  const requestLocation = () => {
    setError(null);
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      return;
    }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setLocation(nextLocation);
        fetchExploreData(nextLocation.latitude, nextLocation.longitude, radius, true, sortMode);
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
      fetchExploreData(location?.latitude ?? DEFAULT_LAT, location?.longitude ?? DEFAULT_LNG, nextRadius, true, sortMode);
    }, 220);
  };

  useEffect(() => () => {
    if (radiusDebounceRef.current) window.clearTimeout(radiusDebounceRef.current);
  }, []);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { 'All Categories': businesses.length };
    businesses.forEach((business) => {
      const category = business.category || 'Other';
      counts[category] = (counts[category] || 0) + 1;
    });
    return counts;
  }, [businesses]);

  const categories = useMemo(() => Object.entries(categoryCounts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => {
      if (a.label === 'All Categories') return -1;
      if (b.label === 'All Categories') return 1;
      return b.count - a.count;
    })
    .slice(0, 10), [categoryCounts]);

  const businessTagMap = useMemo(() => {
    const next: Record<string, string[]> = {};
    businesses.forEach((business) => {
      next[getBusinessId(business)] = deriveBusinessTags(business);
    });
    return next;
  }, [businesses]);

  const tagFacets = useMemo(() => {
    const counts: Record<string, number> = {};
    businesses.forEach((business) => {
      const uniqueTags = new Set(businessTagMap[getBusinessId(business)] ?? []);
      uniqueTags.forEach((tag) => {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.label.localeCompare(b.label);
      })
      .slice(0, 24);
  }, [businessTagMap, businesses]);

  useEffect(() => {
    setSelectedTagFilters((current) => current.filter((tag) => tagFacets.some((facet) => facet.label === tag)));
  }, [tagFacets]);

  const filteredLanes = useMemo(() => lanes
    .map((lane) => ({
      ...lane,
      items: lane.items.filter((business) => matchesFilters(
        business,
        searchQuery,
        selectedCategory,
        selectedTagFilters,
        businessTagMap[getBusinessId(business)] ?? []
      )),
    }))
    .filter((lane) => lane.items.length > 0), [lanes, searchQuery, selectedCategory, selectedTagFilters, businessTagMap]);

  const selectedLane = useMemo(() => filteredLanes.find((lane) => lane.id === selectedLaneId) ?? null, [filteredLanes, selectedLaneId]);

  useEffect(() => {
    if (selectedLaneId && !selectedLane) setSelectedLaneId(null);
  }, [selectedLane, selectedLaneId]);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [lanes, searchQuery, selectedCategory, selectedTagFilters, viewMode, sortMode, selectedLaneId]);

  const topActiveBusinesses = useMemo(() => {
    const allBusinesses = filteredLanes.flatMap(lane => lane.items);
    const activeBusinesses = allBusinesses.filter(business => isActiveToday(business));

    const uniqueActive = Array.from(
      new Map(activeBusinesses.map(b => [getBusinessId(b), b])).values()
    );

    const sorted = uniqueActive.sort((a, b) => {
      const aCheckins = a.checkins_today ?? 0;
      const bCheckins = b.checkins_today ?? 0;
      if (bCheckins !== aCheckins) return bCheckins - aCheckins;
      
      const aTime = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
      const bTime = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
      return bTime - aTime;
    });
    
    return sorted.slice(0, 3);
  }, [filteredLanes]);

  const filteredLanesWithoutTopActive = useMemo(() => {
    const topActiveIds = new Set(topActiveBusinesses.map(b => getBusinessId(b)));
    
    return filteredLanes.map(lane => ({
      ...lane,
      items: lane.items.filter(b => !topActiveIds.has(getBusinessId(b)))
    })).filter(lane => lane.items.length > 0);
  }, [filteredLanes, topActiveBusinesses]);

  const closeLane = () => {
    setSelectedLaneId(null);
    window.requestAnimationFrame(() => window.scrollTo({ top: laneOverlayScrollRef.current, behavior: 'auto' }));
  };

  const openBusiness = (business: Business) => {
    businessModalScrollRef.current = window.scrollY;
    setSelectedBusiness(business);
  };

  const closeBusiness = () => {
    setSelectedBusiness(null);
    window.requestAnimationFrame(() => window.scrollTo({ top: businessModalScrollRef.current, behavior: 'auto' }));
  };

  const handleBusinessUpdated = (updatedBusiness: Business) => {
    const updatedId = getBusinessId(updatedBusiness);
    setBusinesses((current) => current.map((business) => (getBusinessId(business) === updatedId ? updatedBusiness : business)));
    setLanes((current) => updateBusinessInLanes(current, updatedBusiness));
    setSelectedBusiness(updatedBusiness);
  };

  const handleEventView = async (event: OwnerEvent) => {
    const existing = businesses.find((business) => getBusinessId(business) === event.business_id);
    if (existing) {
      openBusiness(existing);
      return;
    }
    try {
      const fetched = await api.getBusiness(event.business_id);
      openBusiness(fetched);
    } catch {
      
    }
  };

  const handlePreferencesSaved = (updatedUser: User) => {
    setUser(updatedUser);
    setShowPreferenceOnboarding(false);
    fetchExploreData(location?.latitude ?? DEFAULT_LAT, location?.longitude ?? DEFAULT_LNG, radius, true, sortMode);
  };

  const renderBusinessList = (items: Business[]) => {
    const laneBusinessIds = new Set(items.map((business) => getBusinessId(business)));
    const laneEvents = ownerEvents
      .filter((event) => laneBusinessIds.has(event.business_id))
      .slice(0, 2);

    const content: Array<{ type: 'business'; business: Business } | { type: 'event'; event: OwnerEvent }> = [];
    items.forEach((business, index) => {
      content.push({ type: 'business', business });
      const eventIndex = Math.floor(index / 4);
      if ((index + 1) % 4 === 0 && laneEvents[eventIndex]) {
        content.push({ type: 'event', event: laneEvents[eventIndex] });
      }
    });

    if (laneEvents.length > 0 && !content.some((entry) => entry.type === 'event')) {
      content.splice(Math.min(2, content.length), 0, { type: 'event', event: laneEvents[0] });
    }

    return (
      <div className="columns-1 gap-6 sm:columns-2 xl:columns-3 2xl:columns-4">
        {content.map((entry) => {
          if (entry.type === 'event') {
            return (
              <div key={`event-${entry.event.id}`} className="mb-4 break-inside-avoid">
                <OwnerEventCard event={entry.event} onViewBusiness={() => handleEventView(entry.event)} />
              </div>
            );
          }

          const businessId = getBusinessId(entry.business);
          return (
            <div key={businessId} className="mb-4 break-inside-avoid">
              <BusinessCard business={entry.business} isFavorite={savedIds.includes(businessId)} onToggleFavorite={() => void toggleSaved(entry.business)} onViewDetails={() => openBusiness(entry.business)} />
            </div>
          );
        })}
      </div>
    );
  };

  const renderLoadingState = () => {
    if (sortMode === 'canonical') {
      return (
        <div className="space-y-8" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, laneIndex) => (
            <section key={laneIndex} className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                  <div className="skeleton h-3 w-20 rounded-full" />
                  <div className="skeleton h-7 w-48 rounded-full" />
                  <div className="skeleton h-4 w-64 rounded-full" />
                </div>
                <div className="skeleton h-11 w-24 rounded-full" />
              </div>

              {viewMode === 'grid' ? (
                <div className="columns-1 gap-6 sm:columns-2 xl:columns-3 2xl:columns-4">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={`${laneIndex}-${index}`} className="mb-4 break-inside-avoid rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
                      <div className={`skeleton ${index % 3 === 0 ? 'aspect-[4/5]' : index % 3 === 1 ? 'aspect-[1/1]' : 'aspect-[3/4]'} rounded-[20px]`} />
                      <div className="mt-3 space-y-2">
                        <div className="skeleton h-4 w-3/4 rounded-full" />
                        <div className="skeleton h-3 w-full rounded-full" />
                        <div className="skeleton h-3 w-5/6 rounded-full" />
                        <div className="flex gap-2 pt-1">
                          <div className="skeleton h-6 w-20 rounded-full" />
                          <div className="skeleton h-6 w-16 rounded-full" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={`${laneIndex}-${index}`} className="overflow-hidden rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 sm:flex sm:gap-4">
                      <div className="skeleton aspect-[16/9] rounded-[20px] sm:w-[320px] sm:flex-shrink-0" />
                      <div className="mt-3 flex-1 space-y-2 sm:mt-0 sm:py-2">
                        <div className="skeleton h-4 w-2/3 rounded-full" />
                        <div className="skeleton h-3 w-full rounded-full" />
                        <div className="skeleton h-3 w-5/6 rounded-full" />
                        <div className="flex gap-2 pt-1">
                          <div className="skeleton h-6 w-24 rounded-full" />
                          <div className="skeleton h-6 w-20 rounded-full" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      );
    }

    return viewMode === 'grid' ? (
      <div className="columns-1 gap-6 sm:columns-2 xl:columns-3 2xl:columns-4" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="mb-4 break-inside-avoid rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
            <div className={`skeleton ${index % 3 === 0 ? 'aspect-[4/5]' : index % 3 === 1 ? 'aspect-[1/1]' : 'aspect-[3/4]'} rounded-[20px]`} />
            <div className="mt-3 space-y-2">
              <div className="skeleton h-4 w-3/4 rounded-full" />
              <div className="skeleton h-3 w-full rounded-full" />
              <div className="skeleton h-3 w-5/6 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="space-y-4" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="overflow-hidden rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 sm:flex sm:gap-4">
            <div className="skeleton aspect-[16/9] rounded-[20px] sm:w-[320px] sm:flex-shrink-0" />
            <div className="mt-3 flex-1 space-y-2 sm:mt-0 sm:py-2">
              <div className="skeleton h-4 w-2/3 rounded-full" />
              <div className="skeleton h-3 w-full rounded-full" />
              <div className="skeleton h-3 w-5/6 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    );
  };

  const browseAllLane = filteredLanesWithoutTopActive.find((lane) => lane.id === 'all') ?? null;
  const canonicalBrowseHasMore = sortMode === 'canonical' && !!browseAllLane && visibleCount < browseAllLane.items.length;
  const singleLaneHasMore = sortMode !== 'canonical' && filteredLanesWithoutTopActive.length > 0 && visibleCount < filteredLanesWithoutTopActive[0].items.length;
  const hasMoreInSelectedLane = !!selectedLane && visibleCount < selectedLane.items.length;
  const toggleTagFilter = (tag: string) => {
    setSelectedTagFilters((current) => (
      current.includes(tag)
        ? current.filter((value) => value !== tag)
        : [...current, tag]
    ));
  };

  return (
    <div className="explore-page min-h-screen bg-[hsl(var(--background))]">
      <StickySearchFilters
        searchQuery={searchInput}
        onSearchQueryChange={setSearchInput}
        categories={categories}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        filtersOpen={filtersOpen}
        onFiltersToggle={() => setFiltersOpen(!filtersOpen)}
      />

      <FiltersModal
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        radius={radius}
        onRadiusChange={handleRadiusChange}
        minRadius={MIN_RADIUS}
        maxRadius={MAX_RADIUS}
        locationActive={!!location}
        loadingLocation={locationLoading}
        onUseLocation={requestLocation}
        tagFacets={tagFacets}
        selectedTagFilters={selectedTagFilters}
        onToggleTagFilter={toggleTagFilter}
      />

      <div className="mx-auto max-w-[1560px] px-4 py-6 sm:px-6">
        <section className="mb-6">
          {error && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-error bg-error p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-error" />
              <div>
                <p className="text-ui font-semibold text-[hsl(var(--foreground))]">Notice</p>
                <p className="text-ui text-[hsl(var(--muted-foreground))]">{error}</p>
              </div>
            </div>
          )}

          {selectedTagFilters.length > 0 && (
            <div className="mb-6 rounded-[28px] border border-[hsl(var(--border))/0.8] bg-[hsl(var(--card))]/0.9 p-4">
              <div className="flex flex-wrap items-center gap-2">
                {selectedTagFilters.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTagFilter(tag)}
                    className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--primary))/0.3] bg-[hsl(var(--primary))/0.08] px-3 py-1.5 text-caption text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--primary))/0.14]"
                  >
                    {tag}
                    <X className="h-3.5 w-3.5" />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSelectedTagFilters([])}
                  className="rounded-full px-2 py-1 text-caption text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
                >
                  Clear all
                </button>
              </div>
            </div>
          )}

          <div className="space-y-6">
            {loading && renderLoadingState()}

            {}
            {!loading && topActiveBusinesses.length > 0 && (
              <section className="mb-8 animate-fade-in-up">
                {renderBusinessList(topActiveBusinesses)}
              </section>
            )}

            {!loading && filteredLanesWithoutTopActive.length > 0 && (
              <div className="space-y-10">
                  {filteredLanesWithoutTopActive.map((lane) => {
                    const laneLimit = sortMode === 'canonical'
                      ? lane.id === 'all'
                        ? Math.min(visibleCount, lane.items.length)
                        : Math.min(LANE_PREVIEW_COUNT, lane.items.length)
                      : Math.min(visibleCount, lane.items.length);
                    const visibleItems = lane.items.slice(0, laneLimit);
                    return (
                      <section key={lane.id} className="space-y-5 animate-fade-in-up">
                        {renderBusinessList(visibleItems)}
                      </section>
                    );
                  })}

                  {canonicalBrowseHasMore && (
                    <div className="flex justify-center">
                      <Button type="button" variant="outline" onClick={() => setVisibleCount((current) => current + LOAD_MORE_COUNT)} className="rounded-full px-5">
                        <ChevronDown className="h-4 w-4" />
                        Load more
                      </Button>
                    </div>
                  )}

                  {singleLaneHasMore && (
                    <div className="flex justify-center">
                      <Button type="button" variant="outline" onClick={() => setVisibleCount((current) => current + LOAD_MORE_COUNT)} className="rounded-full px-5">
                        <ChevronDown className="h-4 w-4" />
                        Load more
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {!loading && filteredLanesWithoutTopActive.length === 0 && topActiveBusinesses.length === 0 && (
                <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-12 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--secondary))]">
                    <MapPin className="h-5 w-5 text-[hsl(var(--muted-foreground))]" />
                  </div>
                  <h2 className="mt-4 text-subheading font-semibold text-[hsl(var(--foreground))]">No businesses match these filters</h2>
                  <p className="mt-2 text-ui text-[hsl(var(--muted-foreground))]">Try a broader radius or clear some filters.</p>
                </section>
              )}
            </div>
        </section>
      </div>

      {selectedLane && (
        <div className="fixed inset-0 z-40 bg-[hsl(var(--background))/0.72] backdrop-blur-md">
          <div className="absolute inset-0" onClick={closeLane} />
          <div className="relative h-full w-full overflow-hidden bg-[hsl(var(--background))] sm:m-4 sm:h-[calc(100%-2rem)] sm:w-auto sm:rounded-[32px] sm:border sm:border-[hsl(var(--border))/0.8] sm:bg-[hsl(var(--card))]">
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-4 border-b border-[hsl(var(--border))/0.8] px-5 py-5 sm:px-8">
                <div>
                  <p className="text-caption font-semibold uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">Lane detail</p>
                  <h2 className="text-heading font-semibold text-[hsl(var(--foreground))]">{selectedLane.title}</h2>
                  <p className="text-ui text-[hsl(var(--muted-foreground))]">{selectedLane.subtitle} • {selectedLane.items.length} businesses</p>
                </div>
                <Button type="button" variant="outline" onClick={closeLane} className="rounded-full px-4">
                  <X className="h-4 w-4" />
                  Close
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">
                {renderBusinessList(selectedLane.items.slice(0, Math.min(visibleCount, selectedLane.items.length)))}
                {hasMoreInSelectedLane && (
                  <div className="mt-6 flex justify-center">
                    <Button type="button" variant="outline" onClick={() => setVisibleCount((current) => current + LOAD_MORE_COUNT)} className="rounded-full px-5">
                      <ChevronDown className="h-4 w-4" />
                      Load more
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedBusiness && <BusinessModal business={selectedBusiness} onClose={closeBusiness} onBusinessUpdated={handleBusinessUpdated} />}

      <PreferenceOnboardingModal
        open={showPreferenceOnboarding}
        user={user}
        onClose={() => setShowPreferenceOnboarding(false)}
        onSaved={handlePreferencesSaved}
      />

      {loading && businesses.length === 0 && (
        <div className="fixed bottom-5 right-5 flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-ui text-[hsl(var(--muted-foreground))]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading
        </div>
      )}
    </div>
  );
}
