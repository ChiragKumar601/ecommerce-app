import type { Money } from './money.js';

/** The one change-list format used by checkout re-validation and QUOTE_CHANGED (plan §7.3, CHK-002). */
export type QuoteChange =
  | { type: 'ITEM_REMOVED'; variantId: string; name: string; reason: 'inactive' | 'out_of_stock' }
  | { type: 'QTY_REDUCED'; variantId: string; name: string; from: number; to: number }
  | { type: 'PRICE_CHANGED'; variantId: string; name: string; from: Money; to: Money }
  | { type: 'COUPON_REMOVED'; code: string; reason: string }
  | { type: 'DELIVERY_CHANGED'; from: Money; to: Money }
  | { type: 'GIFT_CARD_UNUSABLE'; reason: 'expired' | 'no_balance' | 'inactive' }
  | { type: 'BANK_OFFER_CHANGED'; from: Money; to: Money }
  | { type: 'TOTAL_CHANGED'; from: Money; to: Money };

export type QuoteChangeType = QuoteChange['type'];
