import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { qk, type NavNode, type SiteInfo } from '../lib/query';

export const SITE_FALLBACK: SiteInfo = {
  brandName: 'Wardrobe & Co.',
  demoBanner: 'Demo store — for showcase only. No real orders, payments or deliveries.',
  footer: {},
  company: {},
  popularSearches: [],
};

export function useSite() {
  return useQuery({ queryKey: qk.site, queryFn: () => api<SiteInfo>('/site'), staleTime: 5 * 60_000 });
}

/** Catalogue tree for the mega menu and drawer (NAV-007). */
export function useNav() {
  return useQuery({ queryKey: qk.nav, queryFn: () => api<NavNode[]>('/nav'), staleTime: 5 * 60_000 });
}

/** Number of units in the bag (NAV-004). Wired to the bag in Stage 11. */
export function useBagCount(): number {
  return 0;
}
