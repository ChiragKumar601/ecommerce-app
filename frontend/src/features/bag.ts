import type { Money } from '@app/shared';
import { useQuery } from '@tanstack/react-query';
import { toast } from '../components/ui/toast';
import { api } from '../lib/api-client';
import { deviceStore, useDevice, type DeviceBagLine } from '../lib/device-store';
import { queryClient } from '../lib/query';
import { isAuthenticated, useSession } from './session';

// One bag interface over the device (guest) and the API (customer) (plan §8.2, D-3, AUTH-014).
// Every amount shown comes from the server's quote (INT-001, FE-002).

export interface BagLineView {
  variantId: string;
  productId: string;
  href: string;
  brand: string;
  name: string;
  size: string;
  image: { url: string; alt: string } | null;
  unitPrice: Money;
  unitMrp: Money;
  discountPercent: number;
  quantity: number;
  lineValue: Money;
  lineMrp: Money;
  maxQuantity: number;
  available: number;
  flag: 'inactive' | 'out_of_stock' | 'over_stock' | null;
  flagMessage: string | null;
  priceChange: { from: Money; to: Money; message: string } | null;
}

export interface QuoteView {
  totalMrp: Money;
  discountOnMrp: Money;
  bagValue: Money;
  couponDiscount: Money;
  coupon: { code: string; discount: Money } | null;
  deliveryCharge: Money;
  deliveryFree: boolean;
  freeDeliveryNudge: string | null;
  bankOfferDiscount: Money;
  bankOffer: { state: string; text: string | null };
  total: Money;
  taxPortion: Money;
  taxText: string;
  wallet: { giftCard: Money; credits: Money; giftCardId: string | null };
  remainder: Money;
  allowedMethods: ('card' | 'upi' | 'cod')[];
  methodError: string | null;
}

export interface BagView {
  lines: BagLineView[];
  quote: QuoteView;
  couponCode: string | null;
  couponRemoved: { code: string; message: string } | null;
  coupons: { code: string; description: string; minEligibleValue: Money; eligible: boolean; saving: Money | null; reason: string | null }[];
  units: number;
  blocked: boolean;
  message?: string | null;
  deviceLines?: DeviceBagLine[];
}

export type BagOp =
  | { type: 'add'; variantId: string; quantity?: number }
  | { type: 'set'; variantId: string; quantity: number }
  | { type: 'remove'; variantId: string }
  | { type: 'applyCoupon'; code: string }
  | { type: 'removeCoupon' };

/** The guest query is keyed on what changes the amounts (not on last-seen prices, so price-change notes stay visible). */
const guestKey = (lines: DeviceBagLine[], coupon: string | null) => ['bag', 'guest', lines.map((l) => `${l.variantId}:${l.quantity}`).join(','), coupon] as const;
const customerKey = ['bag', 'account'] as const;

let warned = false;
function warnIfNotPersistent() {
  if (!deviceStore.persistent && !warned) {
    warned = true;
    toast({ title: "Your bag can't be saved on this device", tone: 'danger' }); // FE-003, EC-18
  }
}

/** Stores the server-normalised guest lines and coupon on the device. */
function storeGuest(view: BagView) {
  if (!view.deviceLines) return;
  deviceStore.update((d) => ({ ...d, bag: view.deviceLines!, bagCoupon: view.couponCode }));
}

async function guestQuote(op?: BagOp): Promise<BagView> {
  const d = deviceStore.get();
  return api<BagView>('/bag/guest-quote', { method: 'POST', body: { lines: d.bag, coupon: d.bagCoupon, op } });
}

export function useBag(opts: { fresh?: boolean } = {}) {
  const authed = !!useSession().data?.authenticated;
  const lines = useDevice((d) => d.bag);
  const coupon = useDevice((d) => d.bagCoupon);
  return useQuery<BagView>({
    queryKey: authed ? customerKey : guestKey(lines, coupon),
    queryFn: async () => {
      if (authed) return api<BagView>('/bag');
      const view = await guestQuote();
      storeGuest(view);
      return view;
    },
    enabled: authed || lines.length > 0 || !!coupon,
    // BAG-004: opening the bag always fetches a fresh quote.
    refetchOnMount: opts.fresh ? 'always' : true,
    staleTime: 15_000,
  });
}

/** Units in the bag for the header badge (NAV-004): total units, hidden when empty. */
export function useBagCount(): number {
  const authed = !!useSession().data?.authenticated;
  const deviceUnits = useDevice((d) => d.bag.reduce((s, l) => s + l.quantity, 0));
  const account = useQuery<BagView>({ queryKey: customerKey, queryFn: () => api<BagView>('/bag'), enabled: authed, staleTime: 30_000 });
  return authed ? (account.data?.units ?? 0) : deviceUnits;
}

/** Applies one bag operation for a guest or a customer and returns the new bag (with any capped-quantity message). */
export async function bagAction(op: BagOp): Promise<BagView> {
  if (isAuthenticated()) {
    const view = await (async () => {
      switch (op.type) {
        case 'add': return api<BagView>('/bag/lines', { method: 'POST', body: { variantId: op.variantId, quantity: op.quantity } });
        case 'set': return api<BagView>(`/bag/lines/${op.variantId}`, { method: 'PATCH', body: { quantity: op.quantity } });
        case 'remove': return api<BagView>(`/bag/lines/${op.variantId}`, { method: 'DELETE' });
        case 'applyCoupon': return api<BagView>('/bag/coupon', { method: 'POST', body: { code: op.code } });
        case 'removeCoupon': return api<BagView>('/bag/coupon', { method: 'DELETE' });
      }
    })();
    queryClient.setQueryData(customerKey, view);
    return view;
  }
  const view = await guestQuote(op);
  storeGuest(view);
  const d = deviceStore.get();
  queryClient.setQueryData(guestKey(d.bag, d.bagCoupon), view);
  warnIfNotPersistent();
  return view;
}

/** Move to Wishlist from the bag (BAG-003). */
export async function moveLineToWishlist(line: BagLineView): Promise<BagView> {
  if (isAuthenticated()) {
    const view = await api<BagView>(`/bag/lines/${line.variantId}/move-to-wishlist`, { method: 'POST' });
    queryClient.setQueryData(customerKey, view);
    void queryClient.invalidateQueries({ queryKey: ['wishlist'] });
    void queryClient.invalidateQueries({ queryKey: ['wishlist-ids'] });
    return view;
  }
  deviceStore.update((d) => ({
    ...d,
    wishlist: d.wishlist.some((w) => w.productId === line.productId) ? d.wishlist : [{ productId: line.productId, addedAt: Date.now() }, ...d.wishlist],
  }));
  return bagAction({ type: 'remove', variantId: line.variantId });
}
