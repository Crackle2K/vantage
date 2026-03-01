import { useCallback, useEffect, useState } from 'react';
import { api } from '@/api';
import { useAuth } from '@/contexts/AuthContext';
import type { Business } from '@/types';

const LOCAL_IDS_KEY = 'vantage-favorites';
const LOCAL_ITEMS_KEY = 'vantage-saved-businesses';

function getBusinessId(business: Business) {
  return business.id || business._id || business.name;
}

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readLocalIds(): string[] {
  const value = readLocal<unknown>(LOCAL_IDS_KEY, []);
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function readLocalItems(): Business[] {
  const value = readLocal<unknown>(LOCAL_ITEMS_KEY, []);
  return Array.isArray(value) ? (value as Business[]) : [];
}

function saveLocal(ids: string[], items: Business[]) {
  localStorage.setItem(LOCAL_IDS_KEY, JSON.stringify(ids));
  localStorage.setItem(LOCAL_ITEMS_KEY, JSON.stringify(items));
}

function applyLocalState(setSavedIds: (ids: string[]) => void, setSavedBusinesses: (items: Business[]) => void) {
  const ids = readLocalIds();
  setSavedIds(ids);
  setSavedBusinesses(readLocalItems());
}

export function useSavedBusinesses() {
  const { isAuthenticated } = useAuth();
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [savedBusinesses, setSavedBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!isAuthenticated) {
      applyLocalState(setSavedIds, setSavedBusinesses);
      setLoading(false);
      return;
    }

    try {
      const response = await api.getSavedBusinesses();
      const items = response.items ?? [];
      setSavedBusinesses(items);
      setSavedIds(items.map((item) => getBusinessId(item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load saved businesses');
      setSavedIds([]);
      setSavedBusinesses([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleSaved = useCallback(async (business: Business) => {
    const id = getBusinessId(business);
    const wasSaved = savedIds.includes(id);

    const prevIds = savedIds;
    const prevItems = savedBusinesses;
    const nextIds = wasSaved
      ? prevIds.filter((savedId) => savedId !== id)
      : [id, ...prevIds];
    const nextItems = wasSaved
      ? prevItems.filter((item) => getBusinessId(item) !== id)
      : [business, ...prevItems.filter((item) => getBusinessId(item) !== id)];

    setSavedIds(nextIds);
    setSavedBusinesses(nextItems);
    setError(null);

    if (!isAuthenticated) {
      saveLocal(nextIds, nextItems);
      return;
    }

    try {
      if (wasSaved) {
        await api.unsaveBusiness(id);
      } else {
        await api.saveBusiness(id);
      }
    } catch (err) {
      setSavedIds(prevIds);
      setSavedBusinesses(prevItems);
      setError(err instanceof Error ? err.message : 'Failed to update saved businesses');
    }
  }, [isAuthenticated, savedBusinesses, savedIds]);

  return {
    savedIds,
    savedBusinesses,
    loading,
    error,
    refresh,
    toggleSaved,
  };
}
