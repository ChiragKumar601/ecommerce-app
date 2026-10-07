import type { Money, QuoteChange } from '@app/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { queryClient } from '../lib/query';
import type { Address } from './address';
import type { QuoteView } from './bag';

// Checkout (spec §6.14). The state lives on the server (CHK-007); the client shows what it returns.

export interface PaymentSelection {
  giftCardId: string | null;
  useCredits: boolean;
  method: 'card' | 'upi' | 'cod' | null;
  card: { savedCardId: string } | { issuingBank: string; cardType: 'credit' | 'debit' } | null;
}

export interface CheckoutView {
  id: string;
  source: 'bag' | 'buy_now';
  step: 'address' | 'summary' | 'payment';
  changes: QuoteChange[];
  phone: { value: string | null; needed: boolean; forThisOrderOnly: boolean };
  address: Address | null;
  items: {
    variantId: string; productId: string; href: string; brand: string; name: string; size: string; image: { url: string; alt: string } | null;
    quantity: number; available: number; maxQuantity: number; unitPrice: Money; unitMrp: Money; lineValue: Money; problem: string | null;
  }[];
  couponCode: string | null;
  coupons: { code: string; description: string; minEligibleValue: Money }[];
  quote: QuoteView;
  quoteId: string;
  units: number;
  selection: PaymentSelection;
  savedToAccount?: boolean;
  message?: string | null;
}

export interface PendingOrder {
  orderId: string;
  orderNumber: string;
  amount: string;
  retryEndsAt: string;
  minutesLeft: number;
}

export const checkoutKey = (id: string) => ['checkout', id] as const;

export function useCheckout(id: string) {
  return useQuery({ queryKey: checkoutKey(id), queryFn: () => api<CheckoutView>(`/checkout/${id}`), staleTime: 0, refetchOnWindowFocus: false });
}

/** Runs a checkout mutation and stores the returned view. */
export async function checkoutAction(id: string, path: string, method: 'POST' | 'PUT', body?: unknown): Promise<CheckoutView> {
  const v = await api<CheckoutView>(`/checkout/${id}${path}`, { method, body });
  queryClient.setQueryData(checkoutKey(id), v);
  return v;
}

/** Customer-facing text for one re-validation change (CHK-002, QUOTE_CHANGED). */
export function changeText(c: QuoteChange): string {
  switch (c.type) {
    case 'ITEM_REMOVED': return `${c.name} was removed: ${c.reason === 'inactive' ? 'no longer available' : 'out of stock'}`;
    case 'QTY_REDUCED': return `${c.name}: quantity reduced from ${c.from} to ${c.to}`;
    case 'PRICE_CHANGED': return `${c.name}: price changed from ${c.from.display} to ${c.to.display}`;
    case 'COUPON_REMOVED': return `Coupon ${c.code} was removed${c.reason === 'expired' ? ': it has expired' : c.reason === 'min_value' ? ': the order is below its minimum' : c.reason === 'limit_reached' ? ": you've already used it" : c.reason === 'no_eligible_items' ? ": it doesn't apply to these items" : ''}`;
    case 'DELIVERY_CHANGED': return `Delivery charge changed from ${c.from.paise ? c.from.display : 'FREE'} to ${c.to.paise ? c.to.display : 'FREE'}`;
    case 'GIFT_CARD_UNUSABLE': return `Your gift card can't be used: ${c.reason === 'expired' ? 'it has expired' : c.reason === 'no_balance' ? 'it has no balance' : "it's no longer valid"}`;
    case 'BANK_OFFER_CHANGED': return `Bank offer changed from ${c.from.display} to ${c.to.display}`;
    case 'TOTAL_CHANGED': return `Total changed from ${c.from.display} to ${c.to.display}`;
  }
}
