import { api } from '@/api';
import { logger } from '@/lib/logger';
import type { CustomerEventCreate } from '@/types';

const ANON_SESSION_KEY = 'vantage-anon-session-id';

export function getAnonymousSessionId(): string {
  if (typeof window === 'undefined') {
    return 'server-render';
  }

  try {
    const existing = window.localStorage.getItem(ANON_SESSION_KEY);
    if (existing) return existing;

    const generated =
      typeof window.crypto?.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : `anon_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(ANON_SESSION_KEY, generated);
    return generated;
  } catch {
    return `anon_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  }
}

export async function trackCustomerEvent(event: Omit<CustomerEventCreate, 'anonymous_session_id'> & {
  anonymous_session_id?: string;
}): Promise<void> {
  try {
    await api.createCustomerEvent({
      anonymous_session_id: getAnonymousSessionId(),
      ...event,
    });
  } catch (err) {
    logger.warn('Customer event tracking failed', err);
  }
}
