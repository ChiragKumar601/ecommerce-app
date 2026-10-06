import { describe, expect, it } from 'vitest';
import { computeQuote } from '../../../src/domain/pricing/quote.js';
import { diffQuotes } from '../../../src/domain/pricing/quoteDiff.js';
import { LINE_A, LINE_B, LINE_C, WELCOME10, wx1Input } from './fixtures.js';

describe('quoteDiff — one change-list format (CHK-002, PAY-006)', () => {
  const before = computeQuote(wx1Input());
  it('reports no changes for an identical quote', () => {
    expect(diffQuotes(before, computeQuote(wx1Input()))).toEqual([]);
  });
  it('reports removed items, reduced quantities and price changes', () => {
    const after = computeQuote(wx1Input({ lines: [{ ...LINE_A, qty: 1 }, { ...LINE_B, unitPrice: 259900 }] }));
    const changes = diffQuotes(before, after, { removalReasons: { C: 'inactive' } });
    expect(changes).toContainEqual({ type: 'ITEM_REMOVED', variantId: 'C', name: 'Face serum', reason: 'inactive' });
    expect(changes).toContainEqual({ type: 'QTY_REDUCED', variantId: 'A', name: 'T-shirt', from: 2, to: 1 });
    expect(changes).toContainEqual({
      type: 'PRICE_CHANGED', variantId: 'B', name: 'Sneakers',
      from: { paise: 279900, display: '₹2,799' }, to: { paise: 259900, display: '₹2,599' },
    });
    expect(changes.some((c) => c.type === 'TOTAL_CHANGED')).toBe(true);
  });
  it('reports a removed coupon, a delivery change and a lost gift card', () => {
    const withGift = computeQuote(wx1Input({ lines: [LINE_A, LINE_C], payment: { method: 'upi', giftCard: { id: 'g', balance: 10000, usable: true } } }));
    const after = computeQuote(wx1Input({ lines: [LINE_A, LINE_C], coupon: { definition: { ...WELCOME10, active: false }, customerUses: 0 }, payment: { method: 'upi', giftCard: { id: 'g', balance: 10000, usable: false } } }));
    const types = diffQuotes(withGift, after, { giftCardReason: 'expired' }).map((c) => c.type);
    expect(types).toEqual(expect.arrayContaining(['COUPON_REMOVED', 'GIFT_CARD_UNUSABLE', 'TOTAL_CHANGED']));
    const cheap = computeQuote(wx1Input({ lines: [{ ...LINE_C, unitPrice: 300000, unitMrp: 300000 }], coupon: null }));
    const dear = computeQuote(wx1Input({ lines: [LINE_C], coupon: null }));
    expect(diffQuotes(cheap, dear).map((c) => c.type)).toContain('DELIVERY_CHANGED');
  });
  it('reports a bank-offer change', () => {
    const upi = computeQuote(wx1Input({ payment: { method: 'upi' } }));
    expect(diffQuotes(before, upi).map((c) => c.type)).toContain('BANK_OFFER_CHANGED');
  });
});
