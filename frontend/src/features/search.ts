import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../lib/api-client';
import { deviceStore, useDevice } from '../lib/device-store';

/** Recent searches on the device (SRC-009 guest part): de-duplicated case-insensitively, newest first, ≤ 10. */
export const RECENT_MAX = 10;

export function useRecentSearches(): string[] {
  return useDevice((d) => d.recentSearches);
}

export function addRecentSearch(term: string) {
  const t = term.trim().slice(0, 100);
  if (!t) return;
  deviceStore.update((d) => ({
    ...d,
    recentSearches: [t, ...d.recentSearches.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, RECENT_MAX),
  }));
}

export function clearRecentSearches() {
  deviceStore.update((d) => ({ ...d, recentSearches: [] }));
}

export interface Suggestions {
  categories: { label: string; context: string; href: string }[];
  brands: { label: string; href: string }[];
  products: { label: string; brand: string; href: string; image: string | null; price: string }[];
  popular: string[];
}

/** Value that settles `ms` after the last change (SRC-001: 250 ms debounce). */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export const SUGGEST_MIN_CHARS = 2;
export const SUGGEST_MAX = 8;

export function useSuggestions(term: string) {
  const q = term.trim();
  return useQuery({
    queryKey: ['suggest', q.toLowerCase()],
    queryFn: ({ signal }) => api<Suggestions>(`/search/suggest?q=${encodeURIComponent(q)}`, { signal }),
    enabled: [...q].length >= SUGGEST_MIN_CHARS,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}
