import { useState, useEffect, useCallback, useRef } from 'react';
import { MapPin, Loader2, AlertCircle, Navigation, Search, SlidersHorizontal, X, LayoutGrid, Rss, Star, Tag, ChevronUp, Heart, MessageCircle, Share2, Bookmark } from 'lucide-react';
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

interface Location {
  latitude: number;
  longitude: number;
}

export default function Businesses() {
  const [location, setLocation] = useState<Location | null>(null);
  const [radius, setRadius] = useState<number>(10);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationRequested, setLocationRequested] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [sortBy, setSortBy] = useState('rating');
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'feed'>('grid');

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Blank feed state (no data Ã¢â‚¬â€ ready for API) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const [feedCards, setFeedCards] = useState<number[]>([]);
  const [feedPage, setFeedPage] = useState(1);
  const [feedHasMore, setFeedHasMore] = useState(true);
  const [feedLoading, setFeedLoading] = useState(false);
  const feedSentinelRef = useRef<HTMLDivElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [feedSaved, setFeedSaved] = useState<Set<number>>(new Set());
  const [feedLiked, setFeedLiked] = useState<Set<number>>(new Set());
  const FEED_PAGE_SIZE = 6;
  const FEED_MAX = 30; // total blank cards to simulate

  // Load favorites from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('vantage-favorites');
    if (saved) setFavorites(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('vantage-favorites', JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = (id: string) => {
    setFavorites(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  };

  // Request user location
  const requestLocation = () => {
    setLocationRequested(true);
    setError(null);
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const loc = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setLocation(loc);
        setLoading(false);
        fetchNearby(loc, radius);
      },
      (err) => {
        setLoading(false);
        const messages: Record<number, string> = {
          1: 'Location access denied. Please enable location services.',
          2: 'Location information unavailable.',
          3: 'Location request timed out.',
        };
        setError(messages[err.code] || 'An unknown error occurred.');
      }
    );
  };

  // Fetch nearby businesses
  const fetchNearby = useCallback(async (loc: Location, r: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getNearbyBusinesses(loc.latitude, loc.longitude, r);
      setBusinesses(data);
    } catch {
      try {
        const data = await api.getBusinesses();
        setBusinesses(data);
      } catch {
        setError('Failed to load businesses');
        setBusinesses([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Also try loading all businesses on mount
  useEffect(() => {
    if (!location) {
      api.getBusinesses().then(setBusinesses).catch(() => {});
    }
  }, [location]);

  // Feed mode: load next page of blank cards (simulates API pagination)
  const loadFeedPage = useCallback((page: number, reset = false) => {
    setFeedLoading(true);
    // Simulate network latency
    setTimeout(() => {
      const start = (page - 1) * FEED_PAGE_SIZE;
      const end = Math.min(start + FEED_PAGE_SIZE, FEED_MAX);
      const newIds = Array.from({ length: end - start }, (_, i) => start + i);
      setFeedCards(prev => reset ? newIds : [...prev, ...newIds]);
      setFeedHasMore(end < FEED_MAX);
      setFeedPage(page);
      setFeedLoading(false);
    }, 600);
  }, [FEED_PAGE_SIZE, FEED_MAX]);

  // Reset feed when filters / mode change
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

  // Scroll-to-top button
  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 600);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleRadiusChange = (value: string) => {
    const r = parseInt(value);
    setRadius(r);
    if (location) fetchNearby(location, r);
  };

  // Filter and sort
  const filtered = businesses.filter(b => {
    const matchCategory = selectedCategory === 'All Categories' || b.category === selectedCategory.toLowerCase();
    const matchSearch = !searchQuery ||
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  }).sort((a, b) => {
    switch (sortBy) {
      case 'rating': return (b.rating || 0) - (a.rating || 0);
      case 'reviews': return (b.review_count || 0) - (a.review_count || 0);
      case 'deals': return (b.has_deals ? 1 : 0) - (a.has_deals ? 1 : 0);
      default: return 0;
    }
  });

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      {/* Hero Banner */}
      <div className="relative overflow-hidden bg-[hsl(var(--card))] border-b border-[hsl(var(--border))]">
        <div className="absolute inset-0 gradient-mesh opacity-60" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-[hsl(var(--foreground))] mb-2 font-heading">
            Explore <span className="font-serif">Businesses</span>
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] text-lg font-sub">
            Find, review, and support amazing local businesses near you
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Location & Filter Bar */}
        <div className="glass-card rounded-2xl p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            <div className="flex items-center gap-3 flex-wrap">
              {!location ? (
                <Button
                  onClick={requestLocation}
                  disabled={loading}
                  className="gradient-primary text-white border-0 shadow-md shadow-[#22c55e]/20 hover:shadow-lg transition-all rounded-xl"
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Getting Location...</>
                  ) : (
                    <><Navigation className="w-4 h-4 mr-2" /> Enable Location</>
                  )}
                </Button>
              ) : (
                <div className="flex items-center gap-2 px-4 py-2 bg-[#4ade80]/10 dark:bg-[#4ade80]/15 text-[#052e16] dark:text-[#4ade80] rounded-xl border border-[#4ade80]/30 dark:border-[#4ade80]/25">
                  <MapPin className="w-4 h-4" />
                  <span className="text-sm font-medium">Location Active</span>
                </div>
              )}
              {location && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[hsl(var(--muted-foreground))]">Radius:</span>
                  <div className="flex rounded-xl overflow-hidden border border-[hsl(var(--border))]">
                    {[5, 10, 25, 50].map(r => (
                      <button
                        key={r}
                        onClick={() => handleRadiusChange(r.toString())}
                        className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                          radius === r
                            ? 'bg-[hsl(var(--primary))] text-white'
                            : 'bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]'
                        }`}
                      >
                        {r}km
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 w-full lg:w-auto">
              <div className="relative flex-1 lg:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                <Input
                  placeholder="Search businesses..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-10 rounded-xl"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                    <X className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                  </button>
                )}
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`p-2.5 rounded-xl border transition-colors ${
                  showFilters ? 'bg-[hsl(var(--primary))] text-white border-transparent' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
              {/* View mode toggle */}
              <div className="flex rounded-xl overflow-hidden border border-[hsl(var(--border))]">
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    'p-2.5 transition-colors',
                    viewMode === 'grid'
                      ? 'bg-[hsl(var(--primary))] text-white'
                      : 'bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]'
                  )}
                  title="Grid View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('feed')}
                  className={cn(
                    'p-2.5 transition-colors',
                    viewMode === 'feed'
                      ? 'bg-[hsl(var(--primary))] text-white'
                      : 'bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]'
                  )}
                  title="Feed View"
                >
                  <Rss className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Expandable Filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-[hsl(var(--border))] animate-slide-down">
              <SearchBar searchQuery="" onSearchChange={() => {}} sortBy={sortBy} onSortChange={setSortBy} />
            </div>
          )}

          {/* Results count */}
          {!loading && (businesses.length > 0 || feedCards.length > 0) && (
            <div className="mt-3 pt-3 border-t border-[hsl(var(--border))] text-sm text-[hsl(var(--muted-foreground))]">
              {viewMode === 'grid' ? (
                <>Showing <span className="font-semibold text-[hsl(var(--foreground))]">{filtered.length}</span> of {businesses.length} businesses
                {location && ` within ${radius}km`}</>
              ) : (
                <>Scrolling through <span className="font-semibold text-[hsl(var(--foreground))]">{feedCards.length}</span> businesses</>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-6">
          {/* Sidebar */}
          <div className="hidden lg:block">
            <CategorySidebar selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} />
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Deals */}
            <DealsSection />

            {/* Error */}
            {error && (
              <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 flex items-start gap-3 animate-fade-in">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-800 dark:text-red-300">Error</p>
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              </div>
            )}

            {/* Location Prompt */}
            {viewMode === 'grid' && !locationRequested && !location && !error && businesses.length === 0 && (
              <div className="max-w-lg mx-auto text-center py-20 animate-fade-in">
                <div className="w-20 h-20 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[#22c55e]/20">
                  <MapPin className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-[hsl(var(--foreground))] mb-3 font-heading">Find Businesses Near You</h2>
                <p className="text-[hsl(var(--muted-foreground))] mb-8">Enable location access to discover local businesses in your area</p>
                <Button
                  onClick={requestLocation}
                  size="lg"
                  className="gradient-primary text-white border-0 shadow-lg shadow-[#22c55e]/20 rounded-xl px-8 py-6"
                >
                  <Navigation className="w-5 h-5 mr-2" />
                  Enable Location Access
                </Button>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
                <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mb-4 shadow-lg animate-pulse">
                  <Loader2 className="w-8 h-8 text-white animate-spin" />
                </div>
                <p className="text-[hsl(var(--muted-foreground))] font-medium">Finding businesses...</p>
              </div>
            )}

            {/* Business Grid */}
            {!loading && filtered.length > 0 && viewMode === 'grid' && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 stagger-children">
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

            {/* Feed View Ã¢â‚¬â€ Instagram-style Blank Cards (ready for API) */}
            {viewMode === 'feed' && (
              <div className="max-w-2xl mx-auto space-y-6">
                {feedCards.length === 0 && !feedLoading && (
                  <div className="text-center py-16 animate-fade-in">
                    <Rss className="w-12 h-12 text-[hsl(var(--muted-foreground))] mx-auto mb-4 opacity-40" />
                    <h3 className="text-lg font-semibold text-[hsl(var(--foreground))] mb-2 font-sub">Your feed is empty</h3>
                    <p className="text-[hsl(var(--muted-foreground))]">Try adjusting your filters or check back later</p>
                  </div>
                )}

                {feedCards.map((cardId) => {
                  const liked = feedLiked.has(cardId);
                  const saved = feedSaved.has(cardId);

                  return (
                    <div
                      key={cardId}
                      className="glass-card rounded-2xl overflow-hidden animate-fade-in group"
                    >
                      {/* Header Ã¢â‚¬â€ blank avatar + skeleton name */}
                      <div className="flex items-center gap-3 px-5 py-4">
                        <div className="w-10 h-10 rounded-full bg-[hsl(var(--muted))] flex-shrink-0" />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="h-3.5 w-32 rounded-full skeleton" />
                          <div className="h-2.5 w-48 rounded-full skeleton" />
                        </div>
                        <div className="h-3 w-10 rounded-full skeleton flex-shrink-0" />
                      </div>

                      {/* Image area Ã¢â‚¬â€ blank placeholder */}
                      <div className="relative aspect-[4/3] overflow-hidden bg-[hsl(var(--muted))]">
                        <div className="absolute inset-0 bg-gradient-to-br from-[#4ade80]/20 via-[#22c55e]/10 to-[#052e16]/10 animate-gradient" />
                        {/* Deal badge placeholder */}
                        {cardId % 3 === 0 && (
                          <div className="absolute top-4 right-4">
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold text-white bg-[#22c55e] shadow-lg shadow-[#22c55e]/25">
                              <Tag className="w-3 h-3" />
                              Deal
                            </span>
                          </div>
                        )}
                        {/* Rating pill placeholder */}
                        <div className="absolute bottom-4 left-4 flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-sm">
                          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                          <div className="h-2.5 w-6 rounded-full bg-white/30" />
                        </div>
                      </div>

                      {/* Social actions bar */}
                      <div className="px-5 py-3 flex items-center justify-between border-b border-[hsl(var(--border))]">
                        <div className="flex items-center gap-4">
                          <button
                            onClick={() => setFeedLiked(prev => {
                              const next = new Set(prev);
                              next.has(cardId) ? next.delete(cardId) : next.add(cardId);
                              return next;
                            })}
                            className="flex items-center gap-1.5 group/btn"
                          >
                            <Heart className={cn('w-5 h-5 transition-transform duration-200', liked ? 'text-red-500 fill-red-500 scale-110' : 'text-[hsl(var(--muted-foreground))] group-hover/btn:text-red-400')} />
                            <span className={cn('text-xs font-medium', liked ? 'text-red-500' : 'text-[hsl(var(--muted-foreground))]')}>
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
                          onClick={() => setFeedSaved(prev => {
                            const next = new Set(prev);
                            next.has(cardId) ? next.delete(cardId) : next.add(cardId);
                            return next;
                          })}
                        >
                          <Bookmark className={cn('w-5 h-5 transition-colors', saved ? 'text-[hsl(var(--primary))] fill-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]')} />
                        </button>
                      </div>

                      {/* Description Ã¢â‚¬â€ skeleton lines */}
                      <div className="px-5 py-4 space-y-2">
                        <div className="h-3.5 w-3/4 rounded-full skeleton" />
                        <div className="h-3 w-full rounded-full skeleton" />
                        <div className="h-3 w-5/6 rounded-full skeleton" />
                      </div>
                    </div>
                  );
                })}

                {/* Infinite scroll sentinel */}
                <div ref={feedSentinelRef} className="h-4" />

                {feedLoading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--primary))]" />
                    <span className="ml-2 text-sm text-[hsl(var(--muted-foreground))]">Loading more...</span>
                  </div>
                )}

                {!feedHasMore && feedCards.length > 0 && (
                  <div className="text-center py-10">
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">You're all caught up!</p>
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

            {/* No Results */}
            {!loading && filtered.length === 0 && businesses.length > 0 && viewMode === 'grid' && (
              <div className="text-center py-16 animate-fade-in">
                <Search className="w-12 h-12 text-[hsl(var(--muted-foreground))] mx-auto mb-4 opacity-40" />
                <h3 className="text-lg font-semibold text-[hsl(var(--foreground))] mb-2 font-sub">No matches found</h3>
                <p className="text-[hsl(var(--muted-foreground))]">Try adjusting your filters or search query</p>
                <Button variant="outline" className="mt-4 rounded-xl" onClick={() => { setSearchQuery(''); setSelectedCategory('All Categories'); }}>
                  Clear Filters
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scroll to top button */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-50 w-11 h-11 rounded-full gradient-primary text-white shadow-lg shadow-[#22c55e]/25 flex items-center justify-center hover:scale-110 transition-transform"
        >
          <ChevronUp className="w-5 h-5" />
        </button>
      )}

      {/* Business Detail Modal */}
      {selectedBusiness && (
        <BusinessModal business={selectedBusiness} onClose={() => setSelectedBusiness(null)} />
      )}
    </div>
  );
}
