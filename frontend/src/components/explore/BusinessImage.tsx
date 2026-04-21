/**
 * @fileoverview Lazy-loaded business image with category-based gradient
 * fallback. Uses IntersectionObserver for deferred loading, cycles
 * through fallback image candidates on error, and animates the
 * gradient-to-image transition on load.
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

const categoryGradients: Record<string, string> = {
  restaurants: 'from-[#b6633a] via-[#d18d52] to-[#e2bc6d]',
  cafes: 'from-[#6f4e37] via-[#9a7157] to-[#d0a38a]',
  bars: 'from-[#31456b] via-[#5d63a4] to-[#8b6fcb]',
  shopping: 'from-[#355c7d] via-[#4d7ea8] to-[#88b6d7]',
  beauty: 'from-[#a64d79] via-[#c66e99] to-[#e2a4c3]',
  fitness: 'from-[#2d6a4f] via-[#40916c] to-[#74c69d]',
  health: 'from-[#347a9a] via-[#5ba6c6] to-[#9fd3ea]',
  hotels: 'from-[#425466] via-[#64788c] to-[#a6b6c7]',
  grocery: 'from-[#4f772d] via-[#6a994e] to-[#a7c957]',
  default: 'from-[#566573] via-[#768391] to-[#b3bdc7]',
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
 * Renders a business image with lazy loading and a category-based gradient
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
  const gradientClass = categoryGradients[normalizedCategory] || categoryGradients.default;
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
        <div className={cn('absolute inset-0 bg-gradient-to-br', gradientClass)} />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.16),transparent_42%),linear-gradient(180deg,rgba(12,12,14,0.08),rgba(12,12,14,0.36))]" />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/50 to-transparent" />
      </div>

      {canRenderImage && (
        <img
          src={activeImage}
          alt={alt}
          className={cn(
            'relative h-full w-full object-cover object-center saturate-[1.04] contrast-[1.02] transition-all duration-500 will-change-transform',
            isLoaded ? 'scale-100 opacity-100 blur-0 group-hover:scale-[1.04] motion-reduce:group-hover:scale-100' : 'scale-[1.03] opacity-0 blur-xl'
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
