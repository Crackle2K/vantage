/**
 * @fileoverview Card for displaying a business owner event (e.g. wine
 * tasting, seasonal promo) in the explore grid. Shows the event image,
 * title, date/time, description, and a "View business" button.
 */

import { memo, type KeyboardEvent } from 'react';
import { CalendarDays, Clock3, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BusinessImage } from './BusinessImage';
import type { OwnerEvent } from '@/types';

interface OwnerEventCardProps {
  event: OwnerEvent;
  onViewBusiness: () => void;
}

function eventDateLabel(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (!startDate.getTime()) return 'Upcoming';
  const startLabel = startDate.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  if (!endDate.getTime()) return startLabel;
  const endLabel = endDate.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${startLabel} to ${endLabel}`;
}

/**
 * Renders a card for an owner-created event with image, date label,
 * description, host info, and a "View business" button.
 *
 * @param {OwnerEvent} event - The event data to display.
 * @param {() => void} onViewBusiness - Callback to navigate to the host business.
 * @returns {JSX.Element} The event card element.
 */
export const OwnerEventCard = memo(function OwnerEventCard({ event, onViewBusiness }: OwnerEventCardProps) {
  const dateLabel = eventDateLabel(event.start_time, event.end_time);
  const businessName = event.business_name || 'Claimed business';
  const category = event.business_category || 'Owner event';
  const handleKeyDown = (eventTrigger: KeyboardEvent<HTMLElement>) => {
    if (eventTrigger.key === 'Enter' || eventTrigger.key === ' ') {
      eventTrigger.preventDefault();
      onViewBusiness();
    }
  };

  return (
    <article
      onClick={onViewBusiness}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`View ${businessName}`}
      className="explore-rail-card"
    >
      <div className="explore-rail-card__media aspect-[4/5] h-auto">
        <BusinessImage
          primaryImage={event.image_url || event.business_image_url}
          category={category}
          alt={event.title}
          className="explore-rail-card__image"
        />
        <div className="absolute inset-0 bg-black/42" />
        <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-md border border-white/20 bg-black/35 px-3 py-1 text-caption text-white">
          <Sparkles className="h-3.5 w-3.5" />
          Owner event
        </div>
        <div className="absolute bottom-3 left-3 right-3">
          <p className="text-caption uppercase tracking-[0.14em] text-white/75">{category}</p>
          <h3 className="line-clamp-2 text-xl font-semibold text-white">{event.title}</h3>
        </div>
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--accent))] px-3 py-1 text-caption text-[hsl(var(--foreground))]">
          <CalendarDays className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
          <span className="truncate">{dateLabel}</span>
        </div>

        <p className="line-clamp-3 text-ui text-[hsl(var(--foreground))/0.9]">{event.description}</p>

        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))/0.55] p-3">
          <p className="text-caption uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">Hosted by</p>
          <p className="text-ui font-semibold text-[hsl(var(--foreground))]">{businessName}</p>
          <div className="mt-1 flex items-center gap-1.5 text-caption text-[hsl(var(--muted-foreground))]">
            <Clock3 className="h-3.5 w-3.5" />
            <span>Posted {new Date(event.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={(eventTrigger) => {
            eventTrigger.stopPropagation();
            onViewBusiness();
          }}
          className="w-full focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))/0.45] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--card))]"
        >
          View business
        </Button>
      </div>
    </article>
  );
});
