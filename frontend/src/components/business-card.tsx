import type { KeyboardEvent } from 'react';
import { Heart, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BusinessImage } from '@/components/explore/BusinessImage';
import { buildApiUrl } from '@/api';
import type { Business } from '@/types';

interface BusinessCardProps {
  business: Business;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onViewDetails?: () => void;
}

const IMAGE_ASPECTS = ['aspect-[4/5]', 'aspect-[1/1]', 'aspect-[6/5]', 'aspect-[5/6]', 'aspect-[4/4.5]'] as const;

function distanceLabel(distance?: number): string | null {
  if (typeof distance !== 'number') {
    return null;
  }
  return `${distance.toFixed(1)} km away`;
}

function imageAspectClass(business: Business): string {
  const seed = `${business.id || business._id || business.name}:${business.category || ''}`;
  const hash = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return IMAGE_ASPECTS[hash % IMAGE_ASPECTS.length];
}

function prioritizeImageCandidates(business: Business, proxyPhotoUrl?: string): string[] {
  const rawCandidates = [business.primary_image_url, business.image_url, ...(business.image_urls ?? []), business.image, proxyPhotoUrl]
    .filter((value): value is string => !!value && value.trim().length > 0);
  const seen = new Set<string>();
  const directPhotos: string[] = [];
  const proxyPhotos: string[] = [];
  const placeholders: string[] = [];

  rawCandidates.forEach((candidate) => {
    if (seen.has(candidate)) {
      return;
    }
    seen.add(candidate);

    if (candidate.startsWith('data:image')) {
      placeholders.push(candidate);
      return;
    }

    if (candidate.includes('/api/photos?')) {
      proxyPhotos.push(candidate);
      return;
    }

    directPhotos.push(candidate);
  });

  return [...directPhotos, ...proxyPhotos, ...placeholders];
}

export function BusinessCard({
  business,
  isFavorite,
  onToggleFavorite,
  onViewDetails,
}: BusinessCardProps) {
  const distance = distanceLabel(business.distance);
  const imageAspect = imageAspectClass(business);
  const proxyPhotoUrl = business.place_id
    ? buildApiUrl(`/api/photos?place_id=${encodeURIComponent(business.place_id)}&maxwidth=1200`)
    : undefined;
  const imageCandidates = prioritizeImageCandidates(business, proxyPhotoUrl);
  const canOpenDetails = typeof onViewDetails === 'function';
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!canOpenDetails) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onViewDetails();
    }
  };

  return (
    <article
      onClick={onViewDetails}
      onKeyDown={handleKeyDown}
      role={canOpenDetails ? 'button' : undefined}
      tabIndex={canOpenDetails ? 0 : undefined}
      aria-label={canOpenDetails ? `View ${business.name}` : undefined}
      className={cn(
        'group overflow-hidden transition-all duration-300 motion-reduce:transition-none',
        canOpenDetails && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))/0.45] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--background))]',
        'break-inside-avoid rounded-[22px] bg-transparent hover:-translate-y-1 hover:scale-[1.01] motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100'
      )}
    >
      <div
        className={cn(
          'relative overflow-hidden bg-[hsl(var(--secondary))]',
          `${imageAspect} min-h-[320px] rounded-[22px] shadow-[0_22px_48px_-28px_hsl(var(--shadow-soft)/0.82)]`
        )}
      >
        <div className="absolute inset-0">
          <BusinessImage
            key={imageCandidates.join('|') || business.name}
            primaryImage={imageCandidates[0]}
            imageCandidates={imageCandidates}
            category={business.category}
            alt={business.name}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/62 via-black/18 to-transparent" />

        <div className="absolute right-3 top-3">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite();
            }}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur-sm transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black/20',
              'opacity-100 sm:translate-y-1 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100',
              isFavorite && 'border-[hsl(var(--primary))/0.35] bg-[hsl(var(--primary))/0.28] text-white'
            )}
            aria-label={isFavorite ? 'Remove favorite' : 'Save favorite'}
          >
            <Heart className={cn('h-4 w-4', isFavorite && 'fill-current')} />
          </button>
        </div>

        {distance && (
          <div className="absolute bottom-3 right-3">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-caption text-white/90 backdrop-blur-sm">
              <MapPin className="h-3.5 w-3.5" />
              {distance}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-1 px-1 pb-1 pt-3">
        <h3 className="font-sub font-semibold leading-tight text-[hsl(var(--foreground))] line-clamp-2 text-[1.1rem]">
          {business.name}
        </h3>
        <p className="line-clamp-1 text-caption text-[hsl(var(--muted-foreground))]">
          {business.address || 'Toronto'}
        </p>
      </div>
    </article>
  );
}
