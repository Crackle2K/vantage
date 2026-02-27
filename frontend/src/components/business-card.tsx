import { CheckCircle2, Heart, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BusinessImage } from '@/components/explore/BusinessImage';
import type { Business } from '@/types';

interface BusinessCardProps {
  business: Business;
  trustReasons: string[];
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onViewDetails?: () => void;
}

function distanceLabel(distance?: number): string | null {
  if (typeof distance !== 'number') {
    return null;
  }
  return `${distance.toFixed(1)} km away`;
}

export function BusinessCard({ business, trustReasons, isFavorite, onToggleFavorite, onViewDetails }: BusinessCardProps) {
  const distance = distanceLabel(business.distance);
  const statusLabel = business.is_active_today
    ? 'New & Active'
    : business.is_claimed
    ? 'Claimed'
    : business.has_deals
    ? 'Deal'
    : null;

  return (
    <article
      onClick={onViewDetails}
      className="cursor-pointer overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[0_8px_20px_-16px_hsl(var(--shadow-soft)/0.6)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_26px_-16px_hsl(var(--shadow-soft)/0.7)]"
    >
      <div className="relative">
        <div className="aspect-[16/9] overflow-hidden bg-[hsl(var(--secondary))]">
          <BusinessImage
            primaryImage={business.image_url || business.image}
            businessName={business.name}
            category={business.category}
            alt={business.name}
            className="h-full w-full object-cover"
          />
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite();
          }}
          className={cn(
            'absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-[hsl(var(--border))/0.75] bg-[hsl(var(--card))/0.78] text-[hsl(var(--foreground))] transition-colors duration-200',
            isFavorite && 'text-[hsl(var(--primary))]'
          )}
          aria-label={isFavorite ? 'Remove favorite' : 'Save favorite'}
        >
          <Heart className={cn('h-4 w-4', isFavorite && 'fill-current')} />
        </button>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="line-clamp-1 font-sub text-lg font-semibold leading-tight text-[hsl(var(--foreground))]">
            {business.name}
          </h3>
          {statusLabel && (
            <span className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-2.5 py-1 text-caption text-[hsl(var(--muted-foreground))]">
              {statusLabel}
            </span>
          )}
        </div>

        <p className="line-clamp-1 text-ui text-[hsl(var(--muted-foreground))]">
          {business.category}
          {business.category && ' | '}
          {business.address || 'Toronto'}
        </p>
        {distance && (
          <p className="inline-flex items-center gap-1 text-caption text-[hsl(var(--muted-foreground))]">
            <MapPin className="h-3.5 w-3.5" />
            {distance}
          </p>
        )}

        <div className="space-y-1.5 border-t border-[hsl(var(--border))/0.8] pt-3">
          {trustReasons.slice(0, 2).map((reason) => (
            <p key={reason} className="flex items-center gap-1.5 text-ui text-[hsl(var(--foreground))]">
              <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
              <span className="line-clamp-1">{reason}</span>
            </p>
          ))}
          {trustReasons.length === 0 && (
            <p className="text-ui text-[hsl(var(--muted-foreground))]">Why this is surfacing</p>
          )}
          {business.is_active_today && (
            <p className="text-caption text-[hsl(var(--muted-foreground))]">
              Updated moments ago
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

