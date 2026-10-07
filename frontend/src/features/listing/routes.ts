import type { ListingScopeInfo } from '@app/shared';
import type { RouteObject } from 'react-router';
import { listingLoader } from './query';
import { productLoader, type Product } from '../product';

const lazyPage = (name: 'SectionListing' | 'SearchListing' | 'NodeListing' | 'AllListing' | 'BestSellerListing' | 'BankOfferListing') => async () => ({
  Component: (await import('../../routes/listing'))[name],
});

/** Page titles: "<Node name> – Shop" (FE-007). */
function title(data: unknown): string {
  const s = (data as { scope?: ListingScopeInfo } | undefined)?.scope;
  if (!s) return (data as { search?: boolean } | undefined)?.search ? 'Search' : 'Shop';
  if (s.kind === 'category' || s.kind === 'subcategory') return `${s.breadcrumbs[1]?.label ?? ''} ${s.title} – Shop`.trim();
  return s.kind === 'section' ? `${s.title} – Shop` : s.title;
}

/** Static listing routes come before the dynamic catalogue path; reserved segments never reach it (SD-64). */
export const listingRoutes: RouteObject[] = [
  { path: 'shop/all', loader: listingLoader(() => ({ scope: 'all' })), lazy: lazyPage('AllListing'), handle: { title } },
  { path: 'shop/:section', loader: listingLoader(({ params }) => ({ scope: 'node', node: params['section'] })), lazy: lazyPage('SectionListing'), handle: { title } },
  { path: 'collections/best-seller-styles', loader: listingLoader(() => ({ scope: 'best-seller' })), lazy: lazyPage('BestSellerListing'), handle: { title } },
  {
    path: 'search',
    loader: async (args) => {
      const q = (new URL(args.request.url).searchParams.get('q') ?? '').trim().slice(0, 100);
      if (!q) return { search: true }; // SRC-010: empty queries are ignored
      return listingLoader(() => ({ scope: 'search', q }))(args);
    },
    lazy: lazyPage('SearchListing'),
    handle: { title },
  },
  {
    path: 'p/:slugId',
    loader: productLoader,
    lazy: async () => ({ Component: (await import('../../routes/product/ProductPage')).ProductPage }),
    // "<Product name> – <Brand>" (FE-007).
    handle: { title: (d: unknown) => `${(d as Product).name} – ${(d as Product).brand.name}` },
  },
  { path: 'offers/hdfc', loader: listingLoader(() => ({ scope: 'bank-offer' })), lazy: lazyPage('BankOfferListing'), handle: { title } },
  {
    path: ':section/:category/:sub?',
    loader: listingLoader(({ params }) => ({ scope: 'node', node: [params['section'], params['category'], params['sub']].filter(Boolean).join('/') })),
    lazy: lazyPage('NodeListing'),
    handle: { title },
  },
];
