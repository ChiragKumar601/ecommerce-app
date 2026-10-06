import type { Paise } from '../money.js';

/**
 * Per-unit paid shares of a line (RFD-001): the line's net paid amount split evenly,
 * with the paise remainder going to the last unit.
 */
export function perUnitShares(lineNetPaid: Paise, qty: number): Paise[] {
  if (!Number.isInteger(qty) || qty < 1) throw new RangeError('qty must be a positive integer');
  const base = Math.floor(lineNetPaid / qty);
  return Array.from({ length: qty }, (_, i) => (i === qty - 1 ? lineNetPaid - base * (qty - 1) : base));
}

/**
 * Refund amount for `units` more units of a line, where `alreadyRefundedUnits` units were refunded
 * earlier. Units are refunded in order, so the last unit (carrying the remainder) is refunded last.
 */
export function unitsRefundAmount(lineNetPaid: Paise, qty: number, alreadyRefundedUnits: number, units: number): Paise {
  if (units < 1 || alreadyRefundedUnits < 0 || alreadyRefundedUnits + units > qty) {
    throw new RangeError('unit range is outside the line quantity');
  }
  return perUnitShares(lineNetPaid, qty)
    .slice(alreadyRefundedUnits, alreadyRefundedUnits + units)
    .reduce((a, b) => a + b, 0);
}

/** A captured payment source on an order (spec §4.7 PaymentAllocation). */
export interface CapturedSource {
  source: 'card' | 'upi' | 'gift_card' | 'credits' | 'cod';
  /** Captured amount; for COD, the amount actually collected on delivery (0 if never collected). */
  amount: Paise;
  /** What has already been refunded to this source. */
  refunded: Paise;
  accountGiftCardId?: string | null;
  /** For gift cards: whether the card has expired by the time of this refund (RFD-004). */
  giftCardExpired?: boolean;
}

export type RefundDestination =
  | { destination: 'card' | 'upi'; amount: Paise }
  | { destination: 'gift_card'; amount: Paise; accountGiftCardId: string }
  | { destination: 'credits'; amount: Paise; note?: 'gift_card_expired' | 'cod_refund' };

export interface RefundAllocation {
  amount: Paise;
  destinations: RefundDestination[];
}

/** RFD-002 order: card/UPI → gift card → credits → COD-collected (to credits). */
const ORDER: CapturedSource['source'][] = ['card', 'upi', 'gift_card', 'credits', 'cod'];

/**
 * Allocates a refund across the order's captured sources (RFD-002, RFD-004).
 * The amount is capped so total refunds never exceed what was captured plus collected (RFD-007).
 */
export function allocateRefund(requested: Paise, sources: readonly CapturedSource[]): RefundAllocation {
  if (requested < 0) throw new RangeError('refund amount must be ≥ 0');
  const ordered = [...sources].sort((a, b) => ORDER.indexOf(a.source) - ORDER.indexOf(b.source));
  let remaining = requested;
  const destinations: RefundDestination[] = [];
  const addCredits = (amount: Paise, note?: 'gift_card_expired' | 'cod_refund') => {
    const existing = destinations.find(
      (d): d is Extract<RefundDestination, { destination: 'credits' }> => d.destination === 'credits' && d.note === note,
    );
    if (existing) existing.amount += amount;
    else destinations.push(note ? { destination: 'credits', amount, note } : { destination: 'credits', amount });
  };

  for (const s of ordered) {
    if (remaining === 0) break;
    const room = Math.max(0, s.amount - s.refunded);
    const take = Math.min(room, remaining);
    if (take === 0) continue;
    remaining -= take;
    switch (s.source) {
      case 'card':
      case 'upi':
        destinations.push({ destination: s.source, amount: take });
        break;
      case 'gift_card':
        if (s.giftCardExpired || !s.accountGiftCardId) addCredits(take, 'gift_card_expired');
        else destinations.push({ destination: 'gift_card', amount: take, accountGiftCardId: s.accountGiftCardId });
        break;
      case 'credits':
        addCredits(take);
        break;
      case 'cod':
        addCredits(take, 'cod_refund');
        break;
    }
  }
  return { amount: requested - remaining, destinations };
}
