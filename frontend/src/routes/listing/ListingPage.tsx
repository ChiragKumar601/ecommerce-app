import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { SlidersHorizontal, ArrowUpDown } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { LISTING_SORTS, type ListingResponse, type ListingSort, type ProductCardData } from '@app/shared';
import { ProductCard, ProductCardSkeleton, ProductGrid } from '../../components/product/ProductCard';
import { Breadcrumbs, Button, Chip, EmptyState, ErrorState, InlineMessage, PageLayout, RadioGroup, Select, Sheet, Skeleton, Spinner } from '../../components/ui';
import { errorMessage } from '../../lib/api-client';
import { formatINR } from '../../lib/format';
import { clearAll, getList, hasFilters, LIST_KEYS, listingParams, rememberListing, setList, setParam, SORT_LABELS, type ListingScopeRef } from '../../features/listing/params';
import { listingQuery } from '../../features/listing/query';
import { toggleWishlist, useWishlistIds } from '../../features/wishlist';
import { FilterPanel } from './FilterPanel';

const nf = new Intl.NumberFormat('en-IN');

/** Applied-filter chips (PLP-006), labels from the API where values are ids or slugs. */
function chipsFor(params: URLSearchParams, data: ListingResponse): { key: string; label: string; next: URLSearchParams }[] {
  const chips: { key: string; label: string; next: URLSearchParams }[] = [];
  for (const k of LIST_KEYS) {
    const values = getList(params, k);
    for (const v of values) {
      const label = data.labels[`${k}:${v}`] ?? v;
      chips.push({ key: `${k}:${v}`, label: k === 'size' ? `Size: ${label}` : label, next: setList(params, k, values.filter((x) => x !== v)) });
    }
  }
  const min = params.get('priceMin');
  const max = params.get('priceMax');
  if (min || max) {
    const label = min && max ? `${formatINR(+min * 100)} – ${formatINR(+max * 100)}` : min ? `Over ${formatINR(+min * 100)}` : `Under ${formatINR(+max! * 100)}`;
    chips.push({ key: 'price', label, next: setParam(setParam(params, 'priceMin', null), 'priceMax', null) });
  }
  if (params.get('discount')) chips.push({ key: 'discount', label: `${params.get('discount')}% and above`, next: setParam(params, 'discount', null) });
  if (params.get('rating')) chips.push({ key: 'rating', label: `${params.get('rating')}★ & above`, next: setParam(params, 'rating', null) });
  if (params.get('inStock')) chips.push({ key: 'inStock', label: 'In-stock only', next: setParam(params, 'inStock', null) });
  if (params.get('inclusiveSizing')) chips.push({ key: 'inclusiveSizing', label: 'Inclusive sizing', next: setParam(params, 'inclusiveSizing', null) });
  if (data.scope.kind === 'bank-offer' && data.applied.bankOffer) chips.push({ key: 'bankOffer', label: 'HDFC Bank offer', next: setParam(params, 'bankOffer', '0') });
  return chips;
}

/** Infinite grid: 24 per page, "Load more" when a page fails, end message (PLP-007). */
function InfiniteGrid({ pages, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage }: {
  pages: ListingResponse[]; hasNextPage: boolean; isFetchingNextPage: boolean; isFetchNextPageError: boolean; fetchNextPage: () => void;
}) {
  const wishlist = useWishlistIds();
  const onToggle = useCallback((p: ProductCardData) => toggleWishlist(p.id, p.name), []);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage || isFetchNextPageError) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && !isFetchingNextPage && fetchNextPage(), { rootMargin: '900px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);
  const items = pages.flatMap((p) => p.items);
  return (
    <>
      <ProductGrid>
        {items.map((p, i) => (
          <li key={p.id}>
            <ProductCard product={p} wishlisted={wishlist.has(p.id)} onToggleWishlist={onToggle} priority={i < 4} />
          </li>
        ))}
        {isFetchingNextPage && Array.from({ length: 4 }, (_, i) => <li key={`sk${i}`}><ProductCardSkeleton /></li>)}
      </ProductGrid>
      <div ref={sentinel} className="h-px" aria-hidden="true" />
      <div className="mt-10 flex flex-col items-center gap-3 text-center" aria-live="polite">
        {isFetchNextPageError ? (
          <>
            <InlineMessage tone="danger">Couldn't load more items.</InlineMessage>
            <Button variant="secondary" onClick={() => fetchNextPage()}>Load more</Button>
          </>
        ) : isFetchingNextPage ? (
          <Spinner label="Loading more items" />
        ) : !hasNextPage && items.length > 0 ? (
          <p className="text-small text-ink-muted">You've seen all items</p>
        ) : null}
      </div>
    </>
  );
}

export function ListingPage({ scopeRef }: { scopeRef: ListingScopeRef }) {
  const [search, setSearch] = useSearchParams();
  const { pathname } = useLocation();
  const params = useMemo(() => listingParams(search), [search]);
  // Keep the previous results on screen while a new filter combination loads, so the page doesn't jump.
  const query = useInfiniteQuery({ ...listingQuery(scopeRef, params), placeholderData: keepPreviousData });
  const shown = query.data?.pages[0];
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [staged, setStaged] = useState(params);
  const [stagedSort, setStagedSort] = useState(params.get('sort') ?? 'recommended');
  const filterBtn = useRef<HTMLButtonElement>(null);
  const sortBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (shown && !query.isPlaceholderData) rememberListing(shown.scope.section, pathname, params);
  }, [shown, params, pathname, query.isPlaceholderData]);

  const apply = (next: URLSearchParams) => {
    next.sort();
    setSearch(next, { replace: true, preventScrollReset: true });
  };
  const sort = (params.get('sort') ?? 'recommended') as ListingSort;
  const setSort = (s: string) => apply(setParam(params, 'sort', s === 'recommended' ? null : s));

  if (query.isError && !shown) {
    return (
      <PageLayout>
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </PageLayout>
    );
  }
  if (!shown) return <ListingSkeleton />;

  const data = shown;
  const chips = chipsFor(params, data);
  const pages = query.data?.pages ?? [data];
  const loadingNew = query.isPlaceholderData;
  const crumbs = data.scope.breadcrumbs.map((b) => ({ label: b.label, to: b.href }));

  return (
    <PageLayout>
      <Breadcrumbs items={crumbs} />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h2 font-bold md:text-h1">{data.scope.title}</h1>
          <p className="mt-1 text-small text-ink-muted" aria-live="polite">
            <span className="tabular">{nf.format(data.totalCount)}</span> {data.totalCount === 1 ? 'item' : 'items'}
          </p>
        </div>
        <label className="hidden items-center gap-2 lg:flex">
          <span className="text-small text-ink-muted">Sort by</span>
          <Select value={sort} onChange={(e) => setSort(e.target.value)} className="h-10 w-56">
            {LISTING_SORTS.map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
          </Select>
        </label>
      </div>

      <div className="lg:grid lg:grid-cols-[16rem_1fr] lg:gap-10">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="sticky top-[calc(var(--header-h)+1rem)] max-h-[calc(100dvh-var(--header-h)-2rem)] overflow-y-auto pb-6 pr-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-h4 font-bold">Filters</h2>
              {hasFilters(params) && <Button variant="link" size="sm" onClick={() => apply(clearAll(params))}>Clear all</Button>}
            </div>
            <FilterPanel facets={data.facets} params={params} onChange={apply} scope={scopeRef.scope} />
          </div>
        </aside>

        <div className="min-w-0">
          {/* Mobile / tablet: Filter and Sort open bottom sheets (PLP-010). */}
          <div className="sticky top-[var(--header-h)] z-20 -mx-[var(--page-gutter)] mb-4 grid grid-cols-2 border-y border-line bg-canvas/95 backdrop-blur lg:hidden">
            <button ref={filterBtn} type="button" className="flex h-12 items-center justify-center gap-2 border-r border-line text-small font-semibold" onClick={() => { setStaged(params); setFilterOpen(true); }}>
              <SlidersHorizontal className="size-4" aria-hidden="true" /> Filter{chips.length ? ` (${chips.length})` : ''}
            </button>
            <button ref={sortBtn} type="button" className="flex h-12 items-center justify-center gap-2 text-small font-semibold" onClick={() => { setStagedSort(sort); setSortOpen(true); }}>
              <ArrowUpDown className="size-4" aria-hidden="true" /> Sort: {SORT_LABELS[sort]}
            </button>
          </div>

          {chips.length > 0 && (
            <div className="mb-5 flex flex-wrap items-center gap-2" aria-label="Applied filters">
              {chips.map((c) => <Chip key={c.key} onRemove={() => apply(c.next)} removeLabel={`Remove filter ${c.label}`}>{c.label}</Chip>)}
              <Button variant="link" size="sm" onClick={() => apply(clearAll(params))}>Clear all</Button>
            </div>
          )}

          <div className={loadingNew ? 'pointer-events-none opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={loadingNew}>
            {data.totalCount === 0 ? (
              <EmptyState
                title="No products match these filters"
                description="Try removing a filter or two."
                action={hasFilters(params) ? <Button onClick={() => apply(clearAll(params))}>Clear all filters</Button> : undefined}
              />
            ) : (
              <InfiniteGrid
                pages={pages}
                hasNextPage={!!query.hasNextPage}
                isFetchingNextPage={query.isFetchingNextPage}
                isFetchNextPageError={query.isFetchNextPageError}
                fetchNextPage={() => void query.fetchNextPage()}
              />
            )}
          </div>
        </div>
      </div>

      <Sheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        title="Filters"
        side="bottom"
        returnFocusRef={filterBtn}
        footer={
          <>
            <Button variant="secondary" block onClick={() => setStaged(clearAll(staged))}>Clear</Button>
            <Button block onClick={() => { apply(staged); setFilterOpen(false); }}>Apply</Button>
          </>
        }
      >
        <FilterPanel facets={data.facets} params={staged} onChange={setStaged} scope={scopeRef.scope} />
      </Sheet>
      <Sheet
        open={sortOpen}
        onOpenChange={setSortOpen}
        title="Sort by"
        side="bottom"
        returnFocusRef={sortBtn}
        footer={
          <>
            <Button variant="secondary" block onClick={() => setStagedSort('recommended')}>Clear</Button>
            <Button block onClick={() => { setSort(stagedSort); setSortOpen(false); }}>Apply</Button>
          </>
        }
      >
        <RadioGroup value={stagedSort} onValueChange={setStagedSort} options={LISTING_SORTS.map((s) => ({ value: s, label: SORT_LABELS[s] }))} className="gap-4 py-2" />
      </Sheet>
    </PageLayout>
  );
}

export function ListingSkeleton() {
  return (
    <PageLayout>
      <Skeleton className="mb-4 h-4 w-48" />
      <Skeleton className="mb-6 h-9 w-64" />
      <div className="lg:grid lg:grid-cols-[16rem_1fr] lg:gap-10">
        <div className="hidden space-y-3 lg:block" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-6" />)}
        </div>
        <ProductGrid>
          {Array.from({ length: 8 }, (_, i) => <li key={i}><ProductCardSkeleton /></li>)}
        </ProductGrid>
      </div>
      <span className="sr-only" role="status">Loading products</span>
    </PageLayout>
  );
}
