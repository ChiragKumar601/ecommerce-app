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

export interface SiteInfo {
  brandName: string;
  demoBanner: string;
}

export const qk = {
  site: ['site'] as const,
};
