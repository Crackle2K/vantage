/**
 * @fileoverview Utility for merging Tailwind CSS class names. Combines
 * clsx (conditional class joining) with tailwind-merge (deduplication
 * of conflicting Tailwind utilities).
 */

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Merges class names using clsx and tailwind-merge, handling
 * conditional classes and resolving Tailwind conflicts.
 *
 * @param {...ClassValue[]} inputs - Class values (strings, arrays, or objects).
 * @returns {string} The merged class string.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
