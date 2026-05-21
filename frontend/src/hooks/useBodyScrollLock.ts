import { useEffect } from 'react';

let activeLocks = 0;
let previousOverflow: string | null = null;

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') {
      return;
    }

    const { body } = document;
    if (activeLocks === 0) {
      previousOverflow = body.style.overflow;
      body.style.overflow = 'hidden';
    }
    activeLocks += 1;

    return () => {
      activeLocks = Math.max(0, activeLocks - 1);
      if (activeLocks === 0) {
        body.style.overflow = previousOverflow ?? '';
        previousOverflow = null;
      }
    };
  }, [locked]);
}
