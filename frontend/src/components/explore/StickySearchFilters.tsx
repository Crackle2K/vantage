/**
 * @fileoverview Sticky search bar and category chip rail for the explore
 * page. Remains pinned below the header while scrolling, providing
 * search input, category filters, and a filters modal toggle.
 */

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

/**
 * Renders the sticky search-and-filter bar for the explore page.
 * Contains a search input, a FiltersButton, and a scrollable row of
 * CategoryChip components.
 *
 * @param {StickySearchFiltersProps} props - Search state, categories, and callbacks.
 * @returns {JSX.Element} The sticky search/filter section.
 */
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
    <section className="sticky top-16 z-40 border-b border-[hsl(var(--border))/0.7] bg-[hsl(var(--background))] px-6 py-3 sm:px-10">
      <div className="space-y-3">
        {}
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
          <Input
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search businesses..."
            className="h-12 rounded-full border-[hsl(var(--primary))/0.22] bg-[hsl(var(--background))/0.55] pl-11"
          />
        </div>

        {}
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
