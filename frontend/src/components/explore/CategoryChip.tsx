import { cn } from '@/lib/utils';

interface CategoryChipProps {
  label: string;
  count?: number;
  selected?: boolean;
  onClick?: () => void;
}

export function CategoryChip({ label, count, selected = false, onClick }: CategoryChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-16 shrink-0 items-center gap-2 rounded-full border px-6 py-2 text-ui font-medium transition-colors duration-200 whitespace-nowrap',
        selected
          ? 'border-[hsl(var(--primary))/0.45] bg-[hsl(var(--primary))/0.16] text-[hsl(var(--foreground))] dark:bg-[hsl(var(--primary))/0.24]'
          : 'border-[hsl(var(--primary))/0.22] bg-[hsl(var(--background))/0.45] text-[hsl(var(--foreground))]/90 hover:border-[hsl(var(--primary))/0.4] hover:bg-[hsl(var(--background))/0.65] dark:bg-[hsl(var(--card))/0.45]'
      )}
    >
      <span className="max-w-[180px] overflow-hidden text-ellipsis">{label}</span>
      {typeof count === 'number' && <span className="text-lg font-semibold text-[hsl(var(--muted-foreground))]">{count}</span>}
    </button>
  );
}
