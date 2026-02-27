import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

interface BusinessImageProps {
  primaryImage?: string;
  businessName: string;
  category?: string;
  alt: string;
  className?: string;
}

const categoryFallbacks: Record<string, string> = {
  restaurants: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1600&q=80',
  cafes: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1600&q=80',
  bars: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=1600&q=80',
  shopping: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1600&q=80',
  beauty: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1600&q=80',
  fitness: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1600&q=80',
  health: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=1600&q=80',
  hotels: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=80',
  grocery: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1600&q=80',
  default: 'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1600&q=80',
};

function normalizeCategory(category?: string): string {
  const lower = (category || '').toLowerCase();
  if (!lower) return 'default';

  if (lower.includes('restaurant') || lower.includes('food')) return 'restaurants';
  if (lower.includes('cafe') || lower.includes('coffee')) return 'cafes';
  if (lower.includes('bar') || lower.includes('nightlife')) return 'bars';
  if (lower.includes('shopping') || lower.includes('retail')) return 'shopping';
  if (lower.includes('beauty') || lower.includes('spa')) return 'beauty';
  if (lower.includes('fitness') || lower.includes('wellness') || lower.includes('active')) return 'fitness';
  if (lower.includes('health') || lower.includes('medical')) return 'health';
  if (lower.includes('hotel') || lower.includes('travel')) return 'hotels';
  if (lower.includes('grocery')) return 'grocery';

  return 'default';
}

function upscaleImageUrl(rawUrl?: string): string | null {
  if (!rawUrl) return null;
  const url = rawUrl.trim();
  if (!url) return null;

  let upgraded = url;

  // Yelp thumbnails -> original size when possible
  upgraded = upgraded.replace('/ms.jpg', '/o.jpg').replace('/ls.jpg', '/o.jpg').replace('/ss.jpg', '/o.jpg');

  try {
    const parsed = new URL(upgraded);

    if (parsed.searchParams.has('w')) parsed.searchParams.set('w', '1600');
    if (parsed.searchParams.has('h')) parsed.searchParams.set('h', '1000');
    if (parsed.searchParams.has('width')) parsed.searchParams.set('width', '1600');
    if (parsed.searchParams.has('height')) parsed.searchParams.set('height', '1000');

    upgraded = parsed.toString();
  } catch {
    // Non-standard URL, keep upgraded value as-is.
  }

  return upgraded;
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export function BusinessImage({ primaryImage, businessName, category, alt, className }: BusinessImageProps) {
  const fallbackCategory = normalizeCategory(category);

  const candidates = useMemo(() => {
    const baseImage = upscaleImageUrl(primaryImage);
    const query = `${businessName} ${category || 'storefront'}`.trim();
    const categoryImage = categoryFallbacks[fallbackCategory] || categoryFallbacks.default;
    const fallbackSeed = encodeURIComponent(`${businessName}-${category || 'local'}`.toLowerCase().replace(/\s+/g, '-'));

    return unique(
      [
        baseImage,
        `https://source.unsplash.com/1600x900/?${encodeURIComponent(query)}`,
        categoryImage,
        `https://picsum.photos/seed/${fallbackSeed}/1600/900`,
      ].filter((value): value is string => !!value)
    );
  }, [primaryImage, businessName, category, fallbackCategory]);

  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [candidates]);

  const src = candidates[candidateIndex];

  if (!src) {
    return (
      <div className={cn('flex h-full w-full items-center justify-center bg-[hsl(var(--secondary))] text-subheading font-semibold text-[hsl(var(--muted-foreground))]', className)}>
        {businessName.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => {
        if (candidateIndex < candidates.length - 1) {
          setCandidateIndex((prev) => prev + 1);
        }
      }}
    />
  );
}
