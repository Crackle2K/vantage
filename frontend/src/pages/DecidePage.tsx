import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader2, MapPin, Navigation, Sparkles } from 'lucide-react';
import { api } from '@/api';
import { BusinessModal } from '@/components/BusinessModal';
import { CategoryChip } from '@/components/explore/CategoryChip';
import { BusinessImage } from '@/components/explore/BusinessImage';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSavedBusinesses } from '@/hooks/useSavedBusinesses';
import type { Business, DecideIntent } from '@/types';

const DEFAULT_LAT = 43.6532;
const DEFAULT_LNG = -79.3832;
const DEFAULT_RADIUS = 8;
const MIN_RADIUS = 1;
const MAX_RADIUS = 50;
const PRIMARY_INTENTS: Array<{ label: string; value: DecideIntent }> = [
  { label: 'Dinner', value: 'DINNER' },
  { label: 'Coffee', value: 'COFFEE' },
  { label: 'Study', value: 'STUDY' },
  { label: 'Date night', value: 'DATE_NIGHT' },
  { label: 'Quick bite', value: 'QUICK_BITE' },
  { label: 'Dessert', value: 'DESSERT' },
];
const TOGGLE_INTENTS: Array<{ label: string; value: DecideIntent }> = [
  { label: 'Walkable', value: 'WALKABLE' },
  { label: 'Open now', value: 'OPEN_NOW' },
  { label: 'Cheap', value: 'CHEAP' },
  { label: 'Trending', value: 'TRENDING' },
  { label: 'Hidden gem', value: 'HIDDEN_GEM' },
  { label: 'Most trusted', value: 'MOST_TRUSTED' },
];
const CATEGORY_OPTIONS = ['Any', 'Restaurants', 'Cafes & Coffee', 'Bars & Nightlife', 'Shopping', 'Fitness & Wellness'] as const;

interface UserLocation {
  latitude: number;
  longitude: number;
}

function getBusinessId(business: Business) {
  return business.id || business._id || business.name;
}

function reasonChipLabel(reasonCode: string): string {
  switch (reasonCode) {
    case 'VERIFIED_TODAY': return 'Verified today';
    case 'HIGH_TRUST': return 'High trust';
    case 'RECENT_MOMENTUM': return 'Recent momentum';
    case 'HIGH_ENGAGEMENT': return 'High engagement';
    case 'CLAIMED': return 'Claimed';
    case 'INDEPENDENT': return 'Independent';
    case 'HIDDEN_GEM': return 'Hidden gem';
    case 'MATCHED_CATEGORIES': return 'Matched category';
    case 'MATCHED_VIBES': return 'Matched vibes';
    default: return reasonCode.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

function buildDescription(business: Business): string {
  return business.short_description || business.description || `A strong local pick in ${business.category}.`;
}

function imageCandidatesFor(business: Business) {
  return [business.primary_image_url, business.image_url, ...(business.image_urls ?? []), business.image]
    .filter((value): value is string => !!value && value.trim().length > 0);
}

function DecideSkeletonCard() {
  return (
    <div className="overflow-hidden rounded-[28px] border border-[hsl(var(--border))/0.8] bg-[hsl(var(--card))]">
      <div className="skeleton aspect-[16/10] w-full" />
      <div className="space-y-4 p-5">
        <div className="skeleton h-4 w-24 rounded-full" />
        <div className="skeleton h-7 w-3/4 rounded-full" />
        <div className="skeleton h-4 w-full rounded-full" />
        <div className="flex gap-2">
          <div className="skeleton h-7 w-24 rounded-full" />
          <div className="skeleton h-7 w-20 rounded-full" />
        </div>
        <div className="flex gap-3">
          <div className="skeleton h-10 flex-1 rounded-full" />
          <div className="skeleton h-10 flex-1 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export default function DecidePage() {
  const { savedIds, toggleSaved } = useSavedBusinesses();
  const [location, setLocation] = useState<UserLocation>({ latitude: DEFAULT_LAT, longitude: DEFAULT_LNG });
  const [locationLoading, setLocationLoading] = useState(false);
  const [usingDefaultArea, setUsingDefaultArea] = useState(true);
  const [primaryIntent, setPrimaryIntent] = useState<DecideIntent | null>(null);
  const [toggles, setToggles] = useState<DecideIntent[]>([]);
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [selectedCategory, setSelectedCategory] = useState<string>('Any');
  const [results, setResults] = useState<Business[]>([]);
  const [intentExplanation, setIntentExplanation] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const modalScrollRef = useRef(0);

  const fetchLocation = useCallback((onSuccess?: () => void) => {
    if (!navigator.geolocation) {
      return;
    }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setUsingDefaultArea(false);
        setLocationLoading(false);
        onSuccess?.();
      },
      () => {
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  useEffect(() => {
    fetchLocation();
  }, [fetchLocation]);

  const toggleRankingSummary = useMemo(() => {
    if (!primaryIntent) {
      return 'Pick a primary intent to start.';
    }
    const rankingLens = ['TRENDING', 'HIDDEN_GEM', 'MOST_TRUSTED'].find((intent) => toggles.includes(intent as DecideIntent)) as DecideIntent | undefined;
    const filterToggles = toggles.filter((intent) => intent !== rankingLens);
    const pieces = [
      PRIMARY_INTENTS.find((item) => item.value === primaryIntent)?.label ?? primaryIntent,
      ...filterToggles.map((toggle) => TOGGLE_INTENTS.find((item) => item.value === toggle)?.label ?? toggle),
    ];
    const lensLabel = rankingLens
      ? TOGGLE_INTENTS.find((item) => item.value === rankingLens)?.label ?? rankingLens
      : 'Live Visibility';
    return `Optimizing for: ${pieces.join(' + ')}${rankingLens ? ` (${lensLabel} lens, ranked by Live Visibility)` : ' (ranked by Live Visibility)'}`;
  }, [primaryIntent, toggles]);

  const requestShape = useMemo(() => {
    if (!primaryIntent) return null;
    const rankingLens = ['TRENDING', 'HIDDEN_GEM', 'MOST_TRUSTED'].find((intent) => toggles.includes(intent as DecideIntent)) as DecideIntent | undefined;
    const constraints = toggles.filter((intent) => intent !== rankingLens);
    if (rankingLens) {
      return {
        intent: rankingLens,
        constraints: [primaryIntent, ...constraints],
      };
    }
    return {
      intent: primaryIntent,
      constraints,
    };
  }, [primaryIntent, toggles]);

  const toggleExtraIntent = (intent: DecideIntent) => {
    setToggles((current) => {
      if (current.includes(intent)) {
        return current.filter((item) => item !== intent);
      }
      if (current.length >= 2) {
        return current;
      }
      return [...current, intent];
    });
  };

  const requestLocation = () => {
    fetchLocation();
  };

  const handlePick = async () => {
    if (!requestShape) {
      setError('Choose one primary intent first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await api.decideForMe(
        location.latitude,
        location.longitude,
        radius,
        requestShape.intent,
        {
          category: selectedCategory === 'Any' ? undefined : selectedCategory,
          constraints: requestShape.constraints,
          limit: 3,
        }
      );
      setResults(response.items ?? []);
      setIntentExplanation(response.intent_explanation ?? []);
    } catch (err) {
      setResults([]);
      setIntentExplanation([]);
      setError(err instanceof Error ? err.message : 'Failed to load picks');
    } finally {
      setLoading(false);
    }
  };

  const openBusiness = (business: Business) => {
    modalScrollRef.current = window.scrollY;
    setSelectedBusiness(business);
  };

  const closeBusiness = () => {
    setSelectedBusiness(null);
    window.requestAnimationFrame(() => window.scrollTo({ top: modalScrollRef.current, behavior: 'auto' }));
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <section className="border-b border-[hsl(var(--border))/0.7] px-6 py-12 sm:px-10">
        <div className="mx-auto max-w-6xl">
          <p className="text-caption font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Goal-based picks</p>
          <h1 className="mt-2 font-heading text-[40px] font-bold leading-tight text-[hsl(var(--foreground))] sm:text-[52px]">Decide for me</h1>
          <p className="mt-3 max-w-3xl text-body text-[hsl(var(--muted-foreground))]">
            Tell us what you want - we&apos;ll pick the best right now using Live Visibility.
          </p>

          <div className="mt-8 rounded-[30px] border border-[hsl(var(--border))/0.8] bg-[hsl(var(--card))]/0.92 p-5 sm:p-6">
            <div className="flex flex-col gap-5">
              <div className="space-y-2">
                <p className="text-caption uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Primary intent</p>
                <div className="flex flex-wrap gap-2">
                  {PRIMARY_INTENTS.map((intent) => (
                    <button
                      key={intent.value}
                      type="button"
                      onClick={() => setPrimaryIntent(intent.value)}
                      className={cn(
                        'rounded-full border px-4 py-2 text-caption font-medium transition-colors',
                        primaryIntent === intent.value
                          ? 'border-[hsl(var(--primary))/0.45] bg-[hsl(var(--primary))/0.16] text-[hsl(var(--foreground))]'
                          : 'border-[hsl(var(--primary))/0.2] bg-[hsl(var(--background))/0.45] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                      )}
                    >
                      {intent.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-caption uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Quick toggles</p>
                  <p className="text-caption text-[hsl(var(--muted-foreground))]">Up to 2</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {TOGGLE_INTENTS.map((toggle) => {
                    const active = toggles.includes(toggle.value);
                    const blocked = !active && toggles.length >= 2;
                    return (
                      <button
                        key={toggle.value}
                        type="button"
                        onClick={() => toggleExtraIntent(toggle.value)}
                        disabled={blocked}
                        className={cn(
                          'rounded-full border px-4 py-2 text-caption font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45',
                          active
                            ? 'border-[hsl(var(--primary))/0.45] bg-[hsl(var(--primary))/0.16] text-[hsl(var(--foreground))]'
                            : 'border-[hsl(var(--primary))/0.2] bg-[hsl(var(--background))/0.45] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                        )}
                      >
                        {toggle.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="rounded-2xl border border-[hsl(var(--border))/0.8] bg-[hsl(var(--background))/0.55] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Button type="button" variant="outline" onClick={requestLocation} disabled={locationLoading} className="rounded-full px-5">
                      {locationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
                      {usingDefaultArea ? 'Use my location' : 'Location enabled'}
                    </Button>
                    <span className="text-caption text-[hsl(var(--muted-foreground))]">
                      {usingDefaultArea ? 'Using default area for the demo' : 'Using your current area'}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <span className="min-w-[96px] text-ui text-[hsl(var(--muted-foreground))]">Radius: {radius} km</span>
                    <input
                      type="range"
                      min={MIN_RADIUS}
                      max={MAX_RADIUS}
                      value={radius}
                      onChange={(event) => setRadius(Number(event.target.value))}
                      className="h-1.5 w-full cursor-pointer accent-[hsl(var(--primary))]"
                      aria-label="Decide radius"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-[hsl(var(--border))/0.8] bg-[hsl(var(--background))/0.55] p-4">
                  <p className="text-caption uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Category</p>
                  <div className="mt-3 no-scrollbar flex gap-2 overflow-x-auto pb-1">
                    {CATEGORY_OPTIONS.map((category) => (
                      <CategoryChip
                        key={category}
                        label={category}
                        selected={selectedCategory === category}
                        onClick={() => setSelectedCategory(category)}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <p className="text-ui text-[hsl(var(--muted-foreground))]">{toggleRankingSummary}</p>
                <Button type="button" onClick={handlePick} disabled={!primaryIntent || loading} className="h-12 rounded-full px-6">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Pick for me
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-8 sm:px-10">
        <div className="mx-auto max-w-6xl">
          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-error bg-error p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-error" />
              <div>
                <p className="text-ui font-semibold text-[hsl(var(--foreground))]">Notice</p>
                <p className="text-ui text-[hsl(var(--muted-foreground))]">{error}</p>
              </div>
            </div>
          )}

          {loading && (
            <div className="grid gap-6 lg:grid-cols-3">
              {[1, 2, 3].map((value) => <DecideSkeletonCard key={value} />)}
            </div>
          )}

          {!loading && results.length > 0 && (
            <>
              <div className="mb-5 rounded-3xl border border-[hsl(var(--border))/0.8] bg-[hsl(var(--card))]/0.86 p-4">
                <p className="text-caption font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Why these picks</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {intentExplanation.map((item) => (
                    <span key={item} className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))/0.66] px-3 py-1.5 text-caption text-[hsl(var(--foreground))]">
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                {results.map((business) => {
                  const businessId = getBusinessId(business);
                  const isSaved = savedIds.includes(businessId);
                  const images = imageCandidatesFor(business);
                  return (
                    <article key={businessId} className="overflow-hidden rounded-[28px] border border-[hsl(var(--border))/0.8] bg-[hsl(var(--card))] shadow-[0_18px_38px_-24px_hsl(var(--shadow-soft)/0.6)]">
                      <div className="relative aspect-[16/10] overflow-hidden bg-[hsl(var(--secondary))]">
                        <BusinessImage
                          primaryImage={images[0]}
                          imageCandidates={images}
                          category={business.category}
                          alt={business.name}
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/72 via-black/20 to-transparent" />
                        <div className="absolute left-4 right-4 top-4 flex items-center justify-between gap-2">
                          <span className="rounded-full border border-white/15 bg-black/35 px-3 py-1 text-caption font-medium text-white">
                            {business.category}
                          </span>
                          <span className="rounded-full border border-white/15 bg-black/35 px-3 py-1 text-caption font-medium text-white">
                            Score {Math.round(business.canonical_rank_score ?? business.ranking_components?.final_score ?? 0)}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-4 p-5">
                        <div>
                          <h2 className="text-subheading font-semibold text-[hsl(var(--foreground))]">{business.name}</h2>
                          <p className="mt-2 line-clamp-3 text-ui text-[hsl(var(--muted-foreground))]">{buildDescription(business)}</p>
                          <p className="mt-2 text-caption text-[hsl(var(--muted-foreground))]">
                            Why this pick: {intentExplanation[0] ?? 'Matches your intent, then re-ranked by Live Visibility.'}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {(business.reason_codes ?? []).slice(0, 3).map((reasonCode) => (
                            <span key={`${businessId}-${reasonCode}`} className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))/0.66] px-3 py-1.5 text-caption text-[hsl(var(--foreground))]">
                              {reasonChipLabel(reasonCode)}
                            </span>
                          ))}
                        </div>

                        <div className="flex gap-3">
                          <Button type="button" variant="outline" onClick={() => openBusiness(business)} className="flex-1 rounded-full">
                            Open
                          </Button>
                          <Button
                            type="button"
                            variant={isSaved ? 'default' : 'outline'}
                            onClick={() => void toggleSaved(business)}
                            className="flex-1 rounded-full"
                          >
                            {isSaved ? 'Saved' : 'Save'}
                          </Button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}

          {!loading && results.length === 0 && (
            <div className="rounded-[28px] border border-[hsl(var(--border))/0.8] bg-[hsl(var(--card))] px-6 py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--secondary))]">
                <MapPin className="h-5 w-5 text-[hsl(var(--muted-foreground))]" />
              </div>
              <h2 className="mt-4 text-subheading font-semibold text-[hsl(var(--foreground))]">No picks yet</h2>
              <p className="mt-2 text-ui text-[hsl(var(--muted-foreground))]">
                Pick a primary intent, then tap "Pick for me" to get three trust-ranked options.
              </p>
            </div>
          )}
        </div>
      </section>

      {selectedBusiness && <BusinessModal business={selectedBusiness} onClose={closeBusiness} />}
    </div>
  );
}
