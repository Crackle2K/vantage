import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { CategoryChip } from './CategoryChip';
import { FiltersButton } from './FiltersPopup';

export interface FilterCategory {
  label: string;
  count: number;
}

interface StickySearchFiltersProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  categories: FilterCategory[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  filtersOpen: boolean;
  onFiltersToggle: () => void;
}

export function StickySearchFilters({
  searchQuery,
  onSearchQueryChange,
  categories,
  selectedCategory,
  onCategoryChange,
  filtersOpen,
  onFiltersToggle,
}: StickySearchFiltersProps) {
  return (
    <section className="sticky top-16 z-40 border-b border-[hsl(var(--border))/0.7] bg-[hsl(var(--background))]/95 px-6 py-3 backdrop-blur-sm sm:px-10">
      <div className="space-y-3">
        {/* Search Bar */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
          <Input
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search businesses..."
            className="h-12 rounded-full border-[hsl(var(--primary))/0.22] bg-[hsl(var(--background))/0.55] pl-11"
          />
        </div>

        {/* Filters Button + Categories - Single Row */}
        <div className="flex items-center gap-3">
          <FiltersButton
            isOpen={filtersOpen}
            onToggle={onFiltersToggle}
          />
          <div className="no-scrollbar flex flex-1 gap-2 overflow-x-auto pb-1">
            {categories.map((category) => (
              <CategoryChip
                key={category.label}
                label={category.label}
                selected={selectedCategory === category.label}
                onClick={() => onCategoryChange(category.label)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
