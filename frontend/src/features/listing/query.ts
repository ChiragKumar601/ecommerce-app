import type { InfiniteData } from '@tanstack/react-query';
import type { ListingResponse } from '@app/shared';
import { redirect, type LoaderFunctionArgs } from 'react-router';
import { api } from '../../lib/api-client';
import { queryClient } from '../../lib/query';
import { apiQuery, carriedParams, hasFilters, isArrivalAt, listingParams, paramsFromApplied, type ListingScopeRef } from './params';

export const listingKey = (ref: ListingScopeRef, params: URLSearchParams) => ['listing', ref.scope, ref.node ?? '', ref.q ?? '', params.toString()] as const;

export function listingQuery(ref: ListingScopeRef, params: URLSearchParams) {
  return {
    queryKey: listingKey(ref, params),
    queryFn: ({ pageParam, signal }: { pageParam: string | null; signal: AbortSignal }) =>
      api<ListingResponse>(`/products?${apiQuery(ref, params, pageParam ? { cursor: pageParam } : {})}`, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: ListingResponse) => last.nextCursor,
    // Cached pages let Back re-render the same results and scroll position (PLP-008, PR-17).
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  };
}

/** Section listings carry filters over from the previous listing in the same section (PLP-009). */
async function withCarryOver(ref: ListingScopeRef, url: URL, params: URLSearchParams): Promise<Response | null> {
  if (isArrivalAt(url) || hasFilters(params) || params.has('sort') || ref.scope !== 'node' || !ref.node) return null;
  const section = ref.node.split('/')[0]!;
  const carried = carriedParams(section, url.pathname);
  if (!carried) return null;
  const pruned = await api<ListingResponse>(`/products?${apiQuery(ref, carried, { prune: '1' })}`);
  const canonical = paramsFromApplied(pruned.applied, carried.get('sort'), ref.scope);
  if (!canonical.toString()) return null;
  queryClient.setQueryData<InfiniteData<ListingResponse, string | null>>(listingKey(ref, canonical), { pages: [pruned], pageParams: [null] });
  return redirect(`${url.pathname}?${canonical.toString()}`);
}

/** Route loader factory: starts the first page in parallel with the page code (plan §8.1). */
export function listingLoader(toRef: (args: LoaderFunctionArgs) => ListingScopeRef) {
  return async (args: LoaderFunctionArgs) => {
    const ref = toRef(args);
    const url = new URL(args.request.url);
    const params = listingParams(url.searchParams);
    const carried = await withCarryOver(ref, url, params);
    if (carried) return carried;
    const data = await queryClient.ensureInfiniteQueryData(listingQuery(ref, params));
    return { scope: data.pages[0]!.scope };
  };
}
