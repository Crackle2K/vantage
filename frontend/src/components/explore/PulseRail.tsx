/**
 * @fileoverview Horizontal scrollable rail showing "Local Pulse" activity
 * items (verified visits, reviews, owner updates) with relative timestamps.
 * Each card links to the associated business.
 */

import { CalendarClock, CheckCircle2, MessageSquareText, Radio, Zap } from 'lucide-react';
import type { ActivityPulseItem } from '@/types';
import { Button } from '@/components/ui/button';
import { BusinessImage } from './BusinessImage';

interface PulseRailProps {
  items: ActivityPulseItem[];
  onView: (item: ActivityPulseItem) => void;
}

function relativeTime(timestamp: string): string {
  const value = new Date(timestamp).getTime();
  if (!value) return 'Just now';
  const minutes = Math.max(1, Math.floor((Date.now() - value) / 60000));
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function PulseIcon({ type }: { type: ActivityPulseItem['type'] }) {
  if (type === 'verified_visit') return <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />;
  if (type === 'review') return <MessageSquareText className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />;
  return <CalendarClock className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />;
}

/**
 * Renders a horizontally scrollable rail of real-time local activity
 * cards (verified visits, reviews, owner updates). Returns null when
 * the items array is empty.
 *
 * @param {ActivityPulseItem[]} items - Pulse activity items to display.
 * @param {(item: ActivityPulseItem) => void} onView - Callback when "View" is clicked.
 * @returns {JSX.Element | null} The pulse rail section or null.
 */
export function PulseRail({ items, onView }: PulseRailProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-sub text-subheading font-semibold leading-tight text-[hsl(var(--foreground))]">
            Local Pulse
          </h2>
          <p className="text-ui text-[hsl(var(--muted-foreground))]">
            Privacy-safe recent activity from nearby verified visits, reviews, and owner updates.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))/0.6] px-3 py-1 text-caption text-[hsl(var(--muted-foreground))]">
          <Radio className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
          Live local
        </span>
      </div>

      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
        {items.map((item) => (
          <article
            key={item.id}
            className="min-w-[270px] max-w-[270px] overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[0_8px_20px_-16px_hsl(var(--shadow-soft)/0.6)]"
          >
            <div className="relative h-24 overflow-hidden bg-[hsl(var(--secondary))]">
              <BusinessImage
                primaryImage={item.business.image_url}
                category={item.business.category}
                alt={item.business.name}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/35 px-2.5 py-1 text-caption text-white">
                <PulseIcon type={item.type} />
                <span>{item.type === 'verified_visit' ? 'Verified visit' : item.type === 'review' ? 'Review' : 'Owner update'}</span>
              </div>
            </div>

            <div className="space-y-2.5 p-3">
              <p className="line-clamp-2 text-ui font-semibold text-[hsl(var(--foreground))]">{item.summary}</p>
              {item.detail && (
                <p className="line-clamp-2 text-ui text-[hsl(var(--muted-foreground))]">{item.detail}</p>
              )}
              <div className="flex items-center gap-1.5 text-caption text-[hsl(var(--muted-foreground))]">
                <Zap className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
                <span>{relativeTime(item.timestamp)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-ui font-medium text-[hsl(var(--foreground))]">{item.business.name}</p>
                  <p className="truncate text-caption text-[hsl(var(--muted-foreground))]">{item.business.category}</p>
                </div>
                <Button type="button" variant="outline" onClick={() => onView(item)} className="rounded-full px-4">
                  View
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
