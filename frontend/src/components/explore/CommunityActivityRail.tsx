import { CheckCircle2, Heart } from 'lucide-react';
import { BusinessImage } from './BusinessImage';

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
            className="min-w-[240px] max-w-[240px] overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[0_8px_20px_-16px_hsl(var(--shadow-soft)/0.6)]"
          >
            <div className="relative h-20 overflow-hidden bg-[hsl(var(--secondary))]">
              <BusinessImage
                primaryImage={item.imageUrl}
                businessName={item.name}
                category={item.category}
                alt={item.name}
                className="h-full w-full object-cover"
              />
              <button className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-[hsl(var(--border))/0.7] bg-[hsl(var(--card))/0.75] text-[hsl(var(--foreground))]">
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
