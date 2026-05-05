/**
 * @fileoverview Lazy-loaded business image with category-based pastel
 * fallback. Uses IntersectionObserver for deferred loading, cycles
 * through fallback image candidates on error, and animates the
 * placeholder-to-image transition on load.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface BusinessImageProps {
  primaryImage?: string;
  imageCandidates?: string[];
  category?: string;
  alt: string;
  className?: string;
}

const categorySurfaces: Record<string, string> = {
  restaurants: 'bg-[#FBF3DB]',
  cafes: 'bg-[#EDF3EC]',
  bars: 'bg-[#E1F3FE]',
  shopping: 'bg-[#F7F6F3]',
  beauty: 'bg-[#FDEBEC]',
  fitness: 'bg-[#EDF3EC]',
  health: 'bg-[#E1F3FE]',
  hotels: 'bg-[#F7F6F3]',
  grocery: 'bg-[#EDF3EC]',
  default: 'bg-[#F7F6F3]',
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

/**
 * Renders a business image with lazy loading and a category-based pastel
 * placeholder. Falls back through candidate images on load error.
 *
 * @param {string} [primaryImage] - Preferred image URL.
 * @param {string[]} [imageCandidates] - Ordered fallback URLs.
 * @param {string} [category] - Business category for gradient selection.
 * @param {string} alt - Alt text for the image.
 * @param {string} [className] - Additional CSS classes.
 * @returns {JSX.Element} The image container with placeholder and loaded image.
 */
export function BusinessImage({ primaryImage, imageCandidates, category, alt, className }: BusinessImageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return !('IntersectionObserver' in window);
  });
  const candidates = useMemo(() => {
    const seen = new Set<string>();
    return [primaryImage, ...(imageCandidates ?? [])]
      .filter((value): value is string => !!value && value.trim().length > 0)
      .filter((value) => {
        if (seen.has(value)) {
          return false;
        }
        seen.add(value);
        return true;
      });
  }, [imageCandidates, primaryImage]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const activeImage = candidates[activeIndex];

  useEffect(() => {
    if (shouldLoad || !activeImage) {
      return;
    }

    const node = containerRef.current;
    if (!node || typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '240px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [activeImage, shouldLoad]);

  const normalizedCategory = normalizeCategory(category);
  const surfaceClass = categorySurfaces[normalizedCategory] || categorySurfaces.default;
  const canRenderImage = shouldLoad && !!activeImage && !hasError;

  return (
    <div ref={containerRef} className={cn('relative h-full w-full overflow-hidden', className)}>
      <div
        aria-hidden="true"
        className={cn(
          'absolute inset-0 overflow-hidden transition-all duration-500',
          isLoaded ? 'scale-105 opacity-0' : 'scale-100 opacity-100'
        )}
      >
        <div className={cn('absolute inset-0', surfaceClass)} />
        <div className="absolute inset-6 border border-[hsl(var(--border))]" />
      </div>

      {canRenderImage && (
        <img
          src={activeImage}
          alt={alt}
          className={cn(
            'relative h-full w-full object-cover object-center saturate-[0.82] contrast-[1.02] transition-opacity duration-500',
            isLoaded ? 'opacity-100 blur-0' : 'opacity-0 blur-xl'
          )}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setIsLoaded(true)}
          onError={() => {
            if (activeIndex < candidates.length - 1) {
              setActiveIndex((current) => current + 1);
              setIsLoaded(false);
              return;
            }
            setHasError(true);
          }}
        />
      )}
    </div>
  );
}
