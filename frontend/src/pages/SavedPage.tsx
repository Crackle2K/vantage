/**
 * @fileoverview Saved businesses page (route `/saved`). Lists the
 * user's bookmarked businesses in a horizontal card layout with
 * image, description, reason chips, and open/remove actions.
 * Delegates to the useSavedBusinesses hook for data management.
 */

import { useRef, useState } from 'react';
import { Bookmark, Loader2 } from 'lucide-react';
import { BusinessModal } from '@/components/BusinessModal';
import { BusinessImage } from '@/components/explore/BusinessImage';
import { Button } from '@/components/ui/button';
import { useSavedBusinesses } from '@/hooks/useSavedBusinesses';
import type { Business } from '@/types';

function getBusinessId(business: Business) {
  return business.id || business._id || business.name;
}

function imageCandidatesFor(business: Business) {
  return [business.primary_image_url, business.image_url, ...(business.image_urls ?? []), business.image]
    .filter((value): value is string => !!value && value.trim().length > 0);
}

function savedLabel(business: Business) {
  return business.saved_at ? `Saved ${new Date(business.saved_at).toLocaleDateString()}` : 'Saved';
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
    default: return reasonCode.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

export default function SavedPage() {
  const { savedBusinesses, loading, error, toggleSaved } = useSavedBusinesses();
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const modalScrollRef = useRef(0);

  const openBusiness = (business: Business) => {
    modalScrollRef.current = window.scrollY;
    setSelectedBusiness(business);
  };

  const closeBusiness = () => {
    setSelectedBusiness(null);
    window.requestAnimationFrame(() => window.scrollTo({ top: modalScrollRef.current, behavior: 'auto' }));
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-5xl">
        <p className="text-caption font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Your shortlist</p>
        <h1 className="mt-2 font-heading text-[38px] font-bold leading-tight text-[hsl(var(--foreground))] sm:text-[48px]">Saved</h1>
        <p className="mt-3 max-w-2xl text-body text-[hsl(var(--muted-foreground))]">
          Quick access to the businesses you want to come back to.
        </p>

        {error && (
          <div className="mt-6 rounded-2xl border border-error bg-error p-4 text-ui text-[hsl(var(--foreground))]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="mt-8 flex items-center gap-3 rounded-2xl border border-[hsl(var(--border))/0.8] bg-[hsl(var(--card))] px-5 py-4 text-ui text-[hsl(var(--muted-foreground))]">
            <Loader2 className="h-4 w-4 icon-spinner" />
            Loading saved businesses
          </div>
        ) : savedBusinesses.length === 0 ? (
          <div className="mt-8 rounded-[28px] border border-[hsl(var(--border))/0.8] bg-[hsl(var(--card))] px-6 py-14 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--secondary))]">
              <Bookmark className="h-5 w-5 text-[hsl(var(--muted-foreground))]" />
            </div>
            <h2 className="mt-4 text-subheading font-semibold text-[hsl(var(--foreground))]">Nothing saved yet</h2>
            <p className="mt-2 text-ui text-[hsl(var(--muted-foreground))]">
              Save a business from Explore or Decide to keep it here.
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-5">
            {savedBusinesses.map((business) => {
              const businessId = getBusinessId(business);
              const images = imageCandidatesFor(business);
              return (
                <article
                  key={businessId}
                  className="grid gap-5 overflow-hidden rounded-[28px] border border-[hsl(var(--border))/0.8] bg-[hsl(var(--card))] p-4 sm:grid-cols-[280px_minmax(0,1fr)] sm:p-5"
                >
                  <div className="overflow-hidden rounded-[22px] bg-[hsl(var(--secondary))]">
                    <BusinessImage
                      primaryImage={images[0]}
                      imageCandidates={images}
                      category={business.category}
                      alt={business.name}
                      className="aspect-[16/10] h-full w-full object-cover"
                    />
                  </div>

                  <div className="flex min-w-0 flex-col justify-between gap-4">
                    <div>
                      <p className="text-caption font-semibold uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">
                        {savedLabel(business)}
                      </p>
                      <h2 className="mt-1 text-subheading font-semibold text-[hsl(var(--foreground))]">{business.name}</h2>
                      <p className="mt-2 line-clamp-3 text-ui text-[hsl(var(--muted-foreground))]">
                        {business.short_description || business.description || business.address}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {(business.reason_codes ?? []).slice(0, 3).map((reasonCode) => (
                        <span key={`${businessId}-${reasonCode}`} className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))/0.66] px-3 py-1.5 text-caption text-[hsl(var(--foreground))]">
                          {reasonChipLabel(reasonCode)}
                        </span>
                      ))}
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Button type="button" variant="outline" onClick={() => openBusiness(business)} className="rounded-full sm:flex-1">
                        Open
                      </Button>
                      <Button type="button" onClick={() => void toggleSaved(business)} className="rounded-full sm:flex-1">
                        Remove
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {selectedBusiness && <BusinessModal business={selectedBusiness} onClose={closeBusiness} />}
    </div>
  );
}
