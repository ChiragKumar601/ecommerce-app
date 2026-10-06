import type { QuoteChange } from '@app/shared';
import { money } from '../money.js';
import type { Quote } from './types.js';

/** Why a line disappeared; supplied by the service that knows product state. */
export type RemovalReasons = Readonly<Record<string, 'inactive' | 'out_of_stock'>>;

/**
 * The single change-list format for checkout re-validation (CHK-002) and QUOTE_CHANGED (PAY-006).
 * `previous` is the quote the customer saw; `next` is the fresh one.
 */
export interface DiffOptions {
  removalReasons?: RemovalReasons;
  /** Why the previously applied gift card can no longer be used. */
  giftCardReason?: 'expired' | 'no_balance' | 'inactive';
}

export function diffQuotes(previous: Quote, next: Quote, options: DiffOptions = {}): QuoteChange[] {
  const removalReasons = options.removalReasons ?? {};
  const changes: QuoteChange[] = [];
  const nextLines = new Map(next.lines.map((l) => [l.variantId, l]));

  for (const before of previous.lines) {
    const after = nextLines.get(before.variantId);
    if (!after) {
      changes.push({
        type: 'ITEM_REMOVED',
        variantId: before.variantId,
        name: before.name,
        reason: removalReasons[before.variantId] ?? 'out_of_stock',
      });
      continue;
    }
    if (after.qty < before.qty) {
      changes.push({ type: 'QTY_REDUCED', variantId: before.variantId, name: before.name, from: before.qty, to: after.qty });
    }
    if (after.unitPrice !== before.unitPrice) {
      changes.push({
        type: 'PRICE_CHANGED',
        variantId: before.variantId,
        name: before.name,
        from: money(before.unitPrice),
        to: money(after.unitPrice),
      });
    }
  }

  if (previous.coupon.state === 'applied' && next.coupon.state !== 'applied') {
    changes.push({
      type: 'COUPON_REMOVED',
      code: previous.coupon.code,
      reason: next.coupon.state === 'rejected' ? next.coupon.reason : 'removed',
    });
  }
  if (previous.deliveryCharge !== next.deliveryCharge) {
    changes.push({ type: 'DELIVERY_CHANGED', from: money(previous.deliveryCharge), to: money(next.deliveryCharge) });
  }
  if (previous.wallet.giftCard > 0 && next.wallet.giftCard === 0) {
    changes.push({ type: 'GIFT_CARD_UNUSABLE', reason: options.giftCardReason ?? 'expired' });
  }
  if (previous.bankOfferDiscount !== next.bankOfferDiscount) {
    changes.push({ type: 'BANK_OFFER_CHANGED', from: money(previous.bankOfferDiscount), to: money(next.bankOfferDiscount) });
  }
  if (previous.total !== next.total) {
    changes.push({ type: 'TOTAL_CHANGED', from: money(previous.total), to: money(next.total) });
  }
  return changes;
}
