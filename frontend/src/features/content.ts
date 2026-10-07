import type { LoaderFunctionArgs } from 'react-router';
import type { HeroSlide } from '../components/landing/HeroCarousel';
import { api } from '../lib/api-client';
import { qk, queryClient } from '../lib/query';

// Queries and loaders for content routes. Kept apart from the pages so the pages can load lazily
// while their data starts loading in parallel (plan §8.1, FE-006).

export interface Landing {
  slides: HeroSlide[];
  bankOffer: { id: string; bankName: string; summary: string; termsText: string; href: string } | null;
  cards: { id: string; name: string; image: { url: string; alt: string }; discountText: string; href: string }[];
}

export const landingQuery = { queryKey: ['landing'], queryFn: () => api<Landing>('/content/landing'), staleTime: 5 * 60_000 };

export const homeLoader = () => queryClient.ensureQueryData(landingQuery);

interface Page { slug: string; title: string; body: string; isPlaceholder: boolean }
export const pageQuery = (slug: string) => ({ queryKey: qk.page(slug), queryFn: () => api<Page>(`/content/pages/${slug}`), staleTime: 5 * 60_000 });

export async function contentPageLoader({ params }: LoaderFunctionArgs) {
  return queryClient.ensureQueryData(pageQuery(params['slug']!));
}

