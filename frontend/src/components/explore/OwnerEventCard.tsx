import type { KeyboardEvent } from 'react';
import { memo } from 'react';
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

function OwnerEventCardComponent({ event, onViewBusiness }: OwnerEventCardProps) {
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
      className="overflow-hidden rounded-[26px] border border-[hsl(var(--border))/0.85] bg-[hsl(var(--card))] shadow-[0_14px_34px_-24px_hsl(var(--shadow-soft)/0.65)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_38px_-24px_hsl(var(--shadow-soft)/0.68)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))/0.45] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--background))] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-[hsl(var(--secondary))]">
        <BusinessImage
          primaryImage={event.image_url || event.business_image_url}
          category={category}
          alt={event.title}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/35 px-3 py-1 text-caption text-white backdrop-blur-sm">
          <Sparkles className="h-3.5 w-3.5" />
          Owner event
        </div>
        <div className="absolute bottom-3 left-3 right-3">
          <p className="text-caption uppercase tracking-[0.14em] text-white/75">{category}</p>
          <h3 className="line-clamp-2 text-xl font-semibold text-white">{event.title}</h3>
        </div>
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-[hsl(var(--primary))/0.18] bg-[hsl(var(--primary))]/0.08 px-3 py-1 text-caption text-[hsl(var(--foreground))]">
          <CalendarDays className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
          <span className="truncate">{dateLabel}</span>
        </div>

        <p className="line-clamp-3 text-ui text-[hsl(var(--foreground))/0.9]">{event.description}</p>

        <div className="rounded-2xl border border-[hsl(var(--border))/0.8] bg-[hsl(var(--background))/0.55] p-3">
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
          className="w-full rounded-full focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))/0.45] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--card))]"
        >
          View business
        </Button>
      </div>
    </article>
  );
}

export const OwnerEventCard = memo(OwnerEventCardComponent, (prevProps, nextProps) => {
  return prevProps.event.id === nextProps.event.id;
});
