import { PERSISTENT_FILTERS, type AppliedFilters, type ListingScope, type ListingSort } from '@app/shared';

/** Listing state in the URL (PLP-008). Values are kept as strings exactly as they appear in the query. */
export const FILTER_KEYS = ['gender', 'category', 'brand', 'colour', 'size', 'priceMin', 'priceMax', 'discount', 'rating', 'inStock', 'bankOffer', 'inclusiveSizing'] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export const LIST_KEYS = ['gender', 'category', 'brand', 'colour', 'size'] as const;
export type ListKey = (typeof LIST_KEYS)[number];

export interface ListingScopeRef {
  scope: ListingScope;
  node?: string;
  q?: string;
}

export const SORT_LABELS: Record<ListingSort, string> = {
  recommended: 'Recommended',
  new: "What's New",
  price_asc: 'Price: Low to High',
  price_desc: 'Price: High to Low',
  discount: 'Discount',
  rating: 'Customer Rating',
};

/** URL keys that define the listing itself: kept by "Clear all", never shown as chips (PLP-006). */
export const SCOPE_KEYS = ['nodes'] as const;

/** Only listing keys survive; everything else in the URL is ignored. */
export function listingParams(search: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  for (const k of [...SCOPE_KEYS, ...FILTER_KEYS, 'sort'] as const) {
    const v = search.get(k);
    if (v) out.set(k, v);
  }
  out.sort();
  return out;
}

export function apiQuery(ref: ListingScopeRef, params: URLSearchParams, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams(params);
  q.set('scope', ref.scope);
  if (ref.node) q.set('node', ref.node);
  if (ref.q) q.set('q', ref.q);
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return q.toString();
}

export const getList = (params: URLSearchParams, key: ListKey): string[] => (params.get(key) ?? '').split(',').filter(Boolean);

export function setList(params: URLSearchParams, key: ListKey, values: string[]): URLSearchParams {
  const next = new URLSearchParams(params);
  if (values.length) next.set(key, values.join(','));
  else next.delete(key);
  return next;
}

export function setParam(params: URLSearchParams, key: FilterKey | 'sort', value: string | undefined | null): URLSearchParams {
  const next = new URLSearchParams(params);
  if (value === undefined || value === null || value === '') next.delete(key);
  else next.set(key, value);
  return next;
}

/** "Clear all" keeps the listing's defining scope; the bank-offer chip returns to its default (PLP-006). */
export function clearAll(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams();
  for (const k of [...SCOPE_KEYS, 'sort'] as const) {
    const v = params.get(k);
    if (v) next.set(k, v);
  }
  return next;
}

/** Canonical params from the API's applied filters (after pruning). */
export function paramsFromApplied(a: AppliedFilters, sort: string | null, scope: ListingScope): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of LIST_KEYS) if (a[k].length) p.set(k, a[k].join(','));
  if (a.priceMin !== undefined) p.set('priceMin', String(a.priceMin));
  if (a.priceMax !== undefined) p.set('priceMax', String(a.priceMax));
  if (a.discount) p.set('discount', String(a.discount));
  if (a.rating) p.set('rating', String(a.rating));
  if (a.inStock) p.set('inStock', '1');
  if (a.inclusiveSizing) p.set('inclusiveSizing', '1');
  if (scope === 'bank-offer' && !a.bankOffer) p.set('bankOffer', '0');
  if (sort) p.set('sort', sort);
  p.sort();
  return p;
}

export function hasFilters(params: URLSearchParams): boolean {
  return FILTER_KEYS.some((k) => params.has(k));
}

// ── Filter persistence within a section (PLP-009) ───────────────────────────────────────────

const PERSIST_KEY = 'wco.listing.persist';

interface Persisted {
  section: string | null;
  path: string;
  params: string;
}

function readPersisted(): Persisted | null {
  try {
    const raw = sessionStorage.getItem(PERSIST_KEY);
    return raw ? (JSON.parse(raw) as Persisted) : null;
  } catch {
    return null;
  }
}

/** Remembers the sort and shared filters of the listing just shown; outside a section, forgets them. */
export function rememberListing(section: string | null, path: string, params: URLSearchParams) {
  const keep = new URLSearchParams();
  for (const k of [...PERSISTENT_FILTERS, 'sort'] as const) {
    const v = params.get(k);
    if (v) keep.set(k, v);
  }
  try {
    sessionStorage.setItem(PERSIST_KEY, JSON.stringify({ section, path, params: keep.toString() } satisfies Persisted));
  } catch {
    /* storage unavailable: no carry-over */
  }
}

/**
 * Params to carry into the listing at `path` in `section`, when the previous listing was a
 * different listing in the same section. Clearing filters on the same listing never re-applies them.
 */
export function carriedParams(section: string, path: string): URLSearchParams | null {
  const p = readPersisted();
  if (!p || p.section !== section || p.path === path || !p.params) return null;
  return new URLSearchParams(p.params);
}

/**
 * Back/forward and reloads must restore exactly what the URL says (PLP-008), so carry-over applies
 * only to forward navigation. During a push the browser still shows the previous URL while loaders
 * run; on back/forward or a reload it already shows the target.
 */
export function isArrivalAt(url: URL): boolean {
  return typeof window !== 'undefined' && window.location.pathname === url.pathname && window.location.search === url.search;
}
