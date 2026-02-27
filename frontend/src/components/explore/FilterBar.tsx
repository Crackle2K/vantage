import { Navigation, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CategoryChip } from './CategoryChip';

export interface FilterCategory {
  label: string;
  count: number;
}

interface FilterBarProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  radius: number;
  onRadiusChange: (value: number) => void;
  minRadius: number;
  maxRadius: number;
  locationActive: boolean;
  loadingLocation: boolean;
  onUseLocation: () => void;
  categories: FilterCategory[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  independentOnly: boolean;
  onToggleIndependent: () => void;
  verifiedOnly: boolean;
  onToggleVerified: () => void;
  claimedOnly: boolean;
  onToggleClaimed: () => void;
  activeTodayOnly: boolean;
  onToggleActiveToday: () => void;
}

interface ToggleChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function ToggleChip({ label, active, onClick }: ToggleChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-4 py-2 text-caption font-medium transition-colors duration-200 whitespace-nowrap',
        active
          ? 'border-[hsl(var(--primary))/0.45] bg-[hsl(var(--primary))/0.16] text-[hsl(var(--foreground))] dark:bg-[hsl(var(--primary))/0.24]'
          : 'border-[hsl(var(--primary))/0.2] bg-[hsl(var(--background))/0.45] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))/0.35] hover:text-[hsl(var(--foreground))]'
      )}
    >
      {label}
    </button>
  );
}

export function FilterBar({
  searchQuery,
  onSearchQueryChange,
  radius,
  onRadiusChange,
  minRadius,
  maxRadius,
  locationActive,
  loadingLocation,
  onUseLocation,
  categories,
  selectedCategory,
  onCategoryChange,
  independentOnly,
  onToggleIndependent,
  verifiedOnly,
  onToggleVerified,
  claimedOnly,
  onToggleClaimed,
  activeTodayOnly,
  onToggleActiveToday,
}: FilterBarProps) {
  return (
    <section className="space-y-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 md:p-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
        <Input
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Search businesses, categories, or neighborhood"
          className="h-12 rounded-full border-[hsl(var(--primary))/0.22] bg-[hsl(var(--background))/0.55] pl-11"
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={onUseLocation}
          disabled={loadingLocation}
          className="rounded-full border-[hsl(var(--primary))/0.24] bg-[hsl(var(--background))/0.45] px-5"
        >
          <Navigation className="h-4 w-4" />
          {locationActive ? 'Location enabled' : 'Use location'}
        </Button>
        <div className="flex w-full items-center gap-3 lg:max-w-[460px]">
          <span className="min-w-[92px] text-ui text-[hsl(var(--muted-foreground))]">Radius: {radius} km</span>
          <input
            type="range"
            min={minRadius}
            max={maxRadius}
            value={radius}
            onChange={(event) => onRadiusChange(Number(event.target.value))}
            className="h-1.5 w-full cursor-pointer accent-[hsl(var(--primary))]"
            aria-label="Search radius"
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-caption uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Categories</p>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {categories.map((category) => (
            <CategoryChip
              key={category.label}
              label={category.label}
              count={category.count}
              selected={selectedCategory === category.label}
              onClick={() => onCategoryChange(category.label)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-caption uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Signals</p>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          <ToggleChip label="Independent" active={independentOnly} onClick={onToggleIndependent} />
          <ToggleChip label="Verified" active={verifiedOnly} onClick={onToggleVerified} />
          <ToggleChip label="Claimed" active={claimedOnly} onClick={onToggleClaimed} />
          <ToggleChip label="Active today" active={activeTodayOnly} onClick={onToggleActiveToday} />
        </div>
      </div>
    </section>
  );
}
