import { toast } from '../components/ui';
import { deviceStore, useDevice } from '../lib/device-store';

/**
 * Wishlist membership and toggle (PLP-014, PDP-010). Guests use device storage (D-30); the
 * account-backed version replaces this for logged-in customers in Stage 11.
 */
export function useWishlistIds(): Set<string> {
  const list = useDevice((d) => d.wishlist);
  // useDevice returns a stable array reference until the wishlist changes.
  return wishlistSet(list);
}

let cache: { list: unknown; set: Set<string> } | null = null;
function wishlistSet(list: { productId: string }[]): Set<string> {
  if (cache?.list !== list) cache = { list, set: new Set(list.map((w) => w.productId)) };
  return cache.set;
}

let warned = false;
export function toggleWishlist(productId: string, name?: string): boolean {
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
