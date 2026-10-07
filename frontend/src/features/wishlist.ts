import type { ProductCardData } from '@app/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { toast } from '../components/ui/toast';
import { api, errorMessage } from '../lib/api-client';
import { deviceStore, useDevice } from '../lib/device-store';
import { queryClient } from '../lib/query';
import { bagAction, type BagView } from './bag';
import { isAuthenticated, useSession } from './session';

/**
 * Wishlist membership, toggle and page data (PLP-014, PDP-010, WSH-*). Guests use device storage
 * (D-30, WSH-003); customers use their account. The toggle is optimistic and reverts on failure.
 */
const idsKey = ['wishlist-ids'] as const;

// Memoised Sets keyed by the source array, so consumers re-render only when membership changes.
const sets = new WeakMap<object, Set<string>>();
function setOf<T>(list: T[], id: (x: T) => string): Set<string> {
  let s = sets.get(list);
  if (!s) sets.set(list, (s = new Set(list.map(id))));
  return s;
}
const EMPTY: string[] = [];

export function useWishlistIds(): Set<string> {
  const authed = !!useSession().data?.authenticated;
  const device = useDevice((d) => d.wishlist);
  const account = useQuery({ queryKey: idsKey, queryFn: async () => (await api<{ productIds: string[] }>('/wishlist/ids')).productIds, enabled: authed, staleTime: 60_000 });
  return authed ? setOf(account.data ?? EMPTY, (x) => x) : setOf(device, (w) => w.productId);
}

let warned = false;
export function toggleWishlist(productId: string, name?: string): boolean {
  if (isAuthenticated()) {
    const before = queryClient.getQueryData<string[]>(idsKey) ?? [];
    const has = before.includes(productId);
    queryClient.setQueryData<string[]>(idsKey, has ? before.filter((id) => id !== productId) : [productId, ...before]);
    const req = has
      ? api<{ productIds: string[] }>(`/wishlist/${productId}`, { method: 'DELETE' })
      : api<{ productIds: string[] }>('/wishlist', { method: 'POST', body: { productId } });
    req.then(
      (r) => {
        queryClient.setQueryData(idsKey, r.productIds);
        void queryClient.invalidateQueries({ queryKey: ['wishlist'] });
      },
      (e: unknown) => {
        queryClient.setQueryData(idsKey, before);
        toast({ title: errorMessage(e), tone: 'danger' });
      },
    );
    toast({ title: has ? 'Removed from wishlist' : 'Added to wishlist', description: name, tone: has ? 'default' : 'success', durationMs: 2500 });
    return !has;
  }
  const has = deviceStore.get().wishlist.some((w) => w.productId === productId);
  deviceStore.update((d) => ({
    ...d,
    wishlist: has ? d.wishlist.filter((w) => w.productId !== productId) : [{ productId, addedAt: Date.now() }, ...d.wishlist],
  }));
  if (!deviceStore.persistent && !warned) {
    warned = true;
    toast({ title: "Your bag can't be saved on this device", tone: 'danger' });
  }
  toast({ title: has ? 'Removed from wishlist' : 'Added to wishlist', description: name, tone: has ? 'default' : 'success', durationMs: 2500 });
  return !has;
}

export interface WishlistItem {
  card: ProductCardData;
  status: 'ok' | 'unavailable' | 'out_of_stock';
}
interface WishlistPage {
  items: WishlistItem[];
  totalCount: number;
  nextCursor: string | null;
}

/** Wishlist page data, 24 at a time (WSH-004). */
export function useWishlistPages() {
  const authed = !!useSession().data?.authenticated;
  const deviceIds = useDevice((d) => d.wishlist).map((w) => w.productId);
  const key = authed ? 'account' : deviceIds.join(',');
  return useInfiniteQuery({
    queryKey: ['wishlist', key],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      authed
        ? api<WishlistPage>(`/wishlist${pageParam ? `?cursor=${pageParam}` : ''}`)
        : api<WishlistPage>('/wishlist/guest-view', { method: 'POST', body: { productIds: deviceIds, cursor: pageParam } }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: (prev) => prev,
  });
}

export async function removeFromWishlist(productId: string) {
  if (isAuthenticated()) {
    const r = await api<{ productIds: string[] }>(`/wishlist/${productId}`, { method: 'DELETE' });
    queryClient.setQueryData(idsKey, r.productIds);
    await queryClient.invalidateQueries({ queryKey: ['wishlist'] });
    return;
  }
  deviceStore.update((d) => ({ ...d, wishlist: d.wishlist.filter((w) => w.productId !== productId) }));
}

/** Move to Bag (WSH-002): adds the chosen (or only) variant, then removes the product from the wishlist. */
export async function moveToBag(productId: string, variantId: string): Promise<BagView> {
  if (isAuthenticated()) {
    const view = await api<BagView>(`/wishlist/${productId}/move-to-bag`, { method: 'POST', body: { variantId } });
    queryClient.setQueryData(['bag', 'account'], view);
    const ids = (queryClient.getQueryData<string[]>(idsKey) ?? []).filter((id) => id !== productId);
    queryClient.setQueryData(idsKey, ids);
    await queryClient.invalidateQueries({ queryKey: ['wishlist'] });
    return view;
  }
  const view = await bagAction({ type: 'add', variantId });
  deviceStore.update((d) => ({ ...d, wishlist: d.wishlist.filter((w) => w.productId !== productId) }));
  return view;
}
