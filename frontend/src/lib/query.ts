import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-client';

/** Shared query client: retry reads only on network/5xx errors (ERR-002); never retry 4xx. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => count < 2 && (!(err instanceof ApiError) || err.status === 0 || err.status >= 500),
    },
    mutations: { retry: false },
  },
});

export interface LinkItem {
  label: string;
  href: string;
}
export interface FooterContent {
  usefulLinks: LinkItem[];
  policyLinks: LinkItem[];
  trustPointers: { title: string; text: string }[];
  howWeMakeShoppingEasy: { title: string; text: string }[];
  social: LinkItem[];
}
export interface SiteInfo {
  brandName: string;
  demoBanner: string;
  footer: Partial<FooterContent>;
  company: Partial<Record<'legalName' | 'registeredAddress' | 'telephone' | 'cin', string>>;
  popularSearches: string[];
}
export interface NavNode {
  id: string;
  name: string;
  slug: string;
  path: string;
  href: string;
  children: NavNode[];
}

/** Query-key factories (plan §8.2). */
export const qk = {
  site: ['site'] as const,
  nav: ['nav'] as const,
  page: (slug: string) => ['page', slug] as const,
  faqs: ['faqs'] as const,
};
