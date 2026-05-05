/**
 * @fileoverview Selectable chip for filtering businesses by category in
 * the explore page's horizontal chip rail.
 */

import { memo } from 'react';
import { cn } from '@/lib/utils';

interface CategoryChipProps {
  label: string;
  count?: number;
  selected?: boolean;
  onClick?: () => void;
}

/**
 * Renders a selectable category filter chip with an optional count badge.
 * Highlighted when selected via primary color background.
 *
 * @param {string} label - Display text for the category.
 * @param {number} [count] - Optional count to display next to the label.
 * @param {boolean} [selected=false] - Whether the chip is currently active.
 * @param {() => void} [onClick] - Click handler for toggling selection.
 * @returns {JSX.Element} The category chip button.
 */
export const CategoryChip = memo(function CategoryChip({ label, count, selected = false, onClick }: CategoryChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-12 shrink-0 items-center gap-2 rounded-md border px-5 py-2 text-ui font-medium transition-colors duration-200 whitespace-nowrap',
        selected
          ? 'border-[hsl(var(--foreground))/0.18] bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]'
          : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))]/90 hover:bg-[hsl(var(--secondary))]'
      )}
    >
      <span className="max-w-[180px] overflow-hidden text-ellipsis">{label}</span>
      {typeof count === 'number' && <span className="text-lg font-semibold text-[hsl(var(--muted-foreground))]">{count}</span>}
    </button>
  );
});
