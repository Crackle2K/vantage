import { useRef, useEffect, memo } from 'react';
import { Navigation, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FiltersButtonProps {
  isOpen: boolean;
  onToggle: () => void;
}

function FiltersButtonComponent({ isOpen, onToggle }: FiltersButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'inline-flex h-16 shrink-0 items-center gap-2 px-6 py-2 text-ui font-medium transition-colors duration-200 whitespace-nowrap',
        isOpen
          ? 'bg-[hsl(var(--primary))/0.16] text-[hsl(var(--foreground))] dark:bg-[hsl(var(--primary))/0.24]'
          : 'bg-[hsl(var(--background))/0.45] text-[hsl(var(--foreground))]/90 hover:bg-[hsl(var(--background))/0.65] dark:bg-[hsl(var(--card))/0.45]'
      )}
      aria-label="Open filters"
      aria-expanded={isOpen}
    >
      <SlidersHorizontal className="h-4 w-4" />
      <span className="max-w-[180px] overflow-hidden text-ellipsis">Filters</span>
    </button>
  );
}

export const FiltersButton = memo(FiltersButtonComponent);

interface FiltersModalProps {
  isOpen: boolean;
  onClose: () => void;
  radius: number;
  onRadiusChange: (value: number) => void;
  minRadius: number;
  maxRadius: number;
  locationActive: boolean;
  loadingLocation: boolean;
  onUseLocation: () => void;
  tagFacets: Array<{ label: string; count: number }>;
  selectedTagFilters: string[];
  onToggleTagFilter: (tag: string) => void;
}

export function FiltersModal({
  isOpen,
  onClose,
  radius,
  onRadiusChange,
  minRadius,
  maxRadius,
  locationActive,
  loadingLocation,
  onUseLocation,
  tagFacets,
  selectedTagFilters,
  onToggleTagFilter,
}: FiltersModalProps) {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur p-4"
      onClick={onClose}
      aria-hidden="true"
    >
      <div
        ref={popupRef}
        className="relative z-[70] w-full max-w-[420px] max-h-[90vh] overflow-y-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-2xl animate-in fade-in-0 zoom-in-95"
        role="dialog"
        aria-label="Filter options"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-ui font-semibold text-[hsl(var(--foreground))]">Filters</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))/0.4]"
            aria-label="Close filters"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={onUseLocation}
              disabled={loadingLocation}
              className="w-full border-[hsl(var(--primary))/0.24] bg-[hsl(var(--background))/0.45] px-5"
            >
              <Navigation className="h-4 w-4" />
              {locationActive ? 'Location enabled' : 'Use location'}
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-ui text-[hsl(var(--muted-foreground))]">Radius</span>
              <span className="text-ui font-semibold text-[hsl(var(--foreground))]">{radius} km</span>
            </div>
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

          {tagFacets.length > 0 && (
            <div className="space-y-2">
              <span className="text-ui text-[hsl(var(--muted-foreground))]">Filter by tags</span>
              <div className="flex flex-wrap gap-2">
                {tagFacets.map((tag) => {
                  const active = selectedTagFilters.includes(tag.label);
                  return (
                    <button
                      key={tag.label}
                      type="button"
                      onClick={() => onToggleTagFilter(tag.label)}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-caption transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))/0.45]',
                        active
                          ? 'border-[hsl(var(--primary))/0.35] bg-[hsl(var(--primary))/0.1] text-[hsl(var(--foreground))]'
                          : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                      )}
                    >
                      <span>{tag.label}</span>
                      <span className="rounded-full bg-[hsl(var(--background))/0.7] px-1.5 py-0.5 text-[10px] font-semibold text-[hsl(var(--muted-foreground))]">
                        {tag.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
