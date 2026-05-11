/**
 * @fileoverview Horizontal scrollable rail showing recent community activity
 * items (check-ins, reviews, etc.) for the explore page. Each card
 * displays a business thumbnail, name, category, and activity summary.
 */

import { CheckCircle2, Heart } from 'lucide-react';
import { BusinessImage } from './BusinessImage';

/** A single community activity item for the rail display. */
export interface CommunityActivityItem {
  id: string;
  name: string;
  category: string;
  timestamp: string;
  summary: string;
  imageUrl?: string;
  secondary?: string;
}

interface CommunityActivityRailProps {
  items: CommunityActivityItem[];
}

/**
 * Renders a horizontally scrollable rail of community activity cards.
 * Returns null when the items array is empty.
 *
 * @param {CommunityActivityItem[]} items - Activity items to display.
 * @returns {JSX.Element | null} The activity rail section or null.
 */
export function CommunityActivityRail({ items }: CommunityActivityRailProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-sub text-subheading font-semibold leading-tight text-[hsl(var(--foreground))]">
          Community Activity Today
        </h2>
        <p className="text-ui text-[hsl(var(--muted-foreground))]">
          Trending nearby based on verified check-ins and activity.
        </p>
      </div>

      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
        {items.map((item) => (
          <article
            key={item.id}
            className="explore-rail-card explore-rail-card--scroll explore-rail-card--compact"
          >
            <div className="explore-rail-card__media">
              <BusinessImage
                primaryImage={item.imageUrl}
                category={item.category}
                alt={item.name}
                className="explore-rail-card__image"
              />
              <button className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-white/24 bg-black/38 text-white backdrop-blur-md">
                <Heart className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-1.5 p-3">
              <p className="truncate text-xl font-semibold text-[hsl(var(--foreground))]">{item.name}</p>
              <p className="truncate text-ui text-[hsl(var(--muted-foreground))]">{item.category}</p>
              <p className="text-ui text-[hsl(var(--foreground))]">{item.summary}</p>
              <div className="flex items-center gap-1.5 text-caption text-[hsl(var(--muted-foreground))]">
                <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
                <span>{item.secondary || item.timestamp}</span>
              </div>
              <p className="text-caption text-[hsl(var(--muted-foreground))]">{item.timestamp}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
