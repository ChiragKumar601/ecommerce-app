import { describe, expect, it } from 'vitest';
import { computeQuote } from '../../../src/domain/pricing/quote.js';
import { seededRandom, randomIntBetween } from '../../../src/domain/random.js';
import type { QuoteLineInput } from '../../../src/domain/pricing/types.js';
import { DELIVERY, HDFC, LINE_A, LINE_B, LINE_C, NOW, WELCOME10, wx1Input } from './fixtures.js';

describe('WX-1 worked example (spec §15) — exact paise', () => {
  const q = computeQuote(wx1Input());
  it('PRC-001 line values', () => {
    expect(q.totalMrp).toBe(789600);
    expect(q.bagValue).toBe(551600);
    expect(q.discountOnMrp).toBe(238000);
  });
  it('PRC-002…004 coupon ₹551.60 capped at ₹300, shares 108.67 / 152.23 / 39.10', () => {
    expect(q.coupon).toEqual({ state: 'applied', code: 'WELCOME10', discount: 30000 });
    expect(q.lines.map((l) => l.couponShare)).toEqual([10867, 15223, 3910]);
  });
  it('PRC-005 delivery is free (₹5,216 > ₹1,999)', () => {
    expect(q.deliveryCharge).toBe(0);
    expect(q.freeDeliveryShortfall).toBe(0);
  });
  it('PRC-006 bank offer ₹454 on base ₹4,536.10, shares 189.10 / 264.90', () => {
    expect(q.bankOffer).toEqual({ state: 'applied', discount: 45400 });
    expect(q.lines.map((l) => l.bankOfferShare)).toEqual([18910, 26490, 0]);
  });
  it('PRC-007 total ₹4,762 and line nets', () => {
    expect(q.total).toBe(476200);
    expect(q.lines.map((l) => l.lineNet)).toEqual([170023, 238187, 67990]);
  });
  it('PRC-010 tax portion ₹80.96 + ₹113.42 + ₹103.71 = ₹298.09', () => {
    expect(q.lines.map((l) => l.taxPortion)).toEqual([8096, 11342, 10371]);
    expect(q.taxPortion).toBe(29809);
  });
  it('PRC-008 credits ₹500, remainder ₹4,262 on the card; PRC-011 COD allowed', () => {
    expect(q.wallet).toEqual({ giftCardId: null, giftCard: 0, credits: 50000 });
    expect(q.remainder).toBe(426200);
    expect(q.allowedMethods).toEqual(['card', 'upi', 'cod']);
    expect(q.methodError).toBeNull();
  });
});

describe('PRC-002/003 coupon rules', () => {
  const lines = [LINE_A, LINE_B];
  it('rejects inactive and out-of-window coupons', () => {
    expect(computeQuote(wx1Input({ coupon: { definition: { ...WELCOME10, active: false }, customerUses: 0 } })).coupon).toMatchObject({ state: 'rejected', reason: 'inactive' });
    expect(computeQuote(wx1Input({ coupon: { definition: { ...WELCOME10, validTo: new Date('2026-10-01') }, customerUses: 0 } })).coupon).toMatchObject({ state: 'rejected', reason: 'expired' });
    expect(computeQuote(wx1Input({ coupon: { definition: { ...WELCOME10, validFrom: new Date('2026-11-01') }, customerUses: 0 } })).coupon).toMatchObject({ state: 'rejected', reason: 'expired' });
  });
  it('rejects below the minimum with the shortfall', () => {
    const q = computeQuote(wx1Input({ lines: [{ ...LINE_C }], coupon: { definition: { ...WELCOME10, minEligibleValue: 79900 }, customerUses: 0 } }));
    expect(q.coupon).toEqual({ state: 'rejected', code: 'WELCOME10', reason: 'min_value', shortfall: 8000 });
    expect(q.couponDiscount).toBe(0);
  });
  it('rejects when no line is in an eligible node', () => {
    const q = computeQuote(wx1Input({ lines, coupon: { definition: { ...WELCOME10, eligibleNodeIds: ['beauty'] }, customerUses: 0 } }));
    expect(q.coupon).toMatchObject({ state: 'rejected', reason: 'no_eligible_items' });
  });
  it('applies only to eligible lines (base and shares)', () => {
    const q = computeQuote(wx1Input({ coupon: { definition: { ...WELCOME10, eligibleNodeIds: ['beauty'], maxDiscount: null, minEligibleValue: 0 }, customerUses: 0 } }));
    expect(q.couponDiscount).toBe(7200); // 10% of ₹719 = ₹71.90 → ₹72
    expect(q.lines.map((l) => l.couponShare)).toEqual([0, 0, 7200]);
  });
  it('enforces the per-customer limit for customers but not guests (SD-03)', () => {
    expect(computeQuote(wx1Input({ coupon: { definition: WELCOME10, customerUses: 1 } })).coupon).toMatchObject({ state: 'rejected', reason: 'limit_reached' });
    expect(computeQuote(wx1Input({ coupon: { definition: WELCOME10, customerUses: null } })).coupon).toMatchObject({ state: 'applied' });
  });
  it('caps a flat coupon at the eligible base', () => {
    const flat = { ...WELCOME10, type: 'flat' as const, value: 100000, maxDiscount: null, minEligibleValue: 0 };
    expect(computeQuote(wx1Input({ lines: [LINE_C], coupon: { definition: flat, customerUses: 0 } })).couponDiscount).toBe(71900);
  });
});

describe('PRC-005 delivery charge', () => {
  const line = (unitPrice: number): QuoteLineInput => ({ ...LINE_C, qty: 1, unitMrp: unitPrice, unitPrice, bankOfferEligible: false });
  const base = { coupon: null, bankOffer: null, payment: null };
  it('charges ₹99 at exactly ₹1,999 and is free above it', () => {
    expect(computeQuote(wx1Input({ ...base, lines: [line(199900)] })).deliveryCharge).toBe(9900);
    expect(computeQuote(wx1Input({ ...base, lines: [line(199901)] })).deliveryCharge).toBe(0);
    expect(computeQuote(wx1Input({ ...base, lines: [line(200000)] })).deliveryCharge).toBe(0);
  });
  it('tests the value after the coupon, not before', () => {
    const q = computeQuote(wx1Input({ lines: [line(210000)], bankOffer: null, payment: null, coupon: { definition: WELCOME10, customerUses: 0 } }));
    expect(q.couponDiscount).toBe(21000);
    expect(q.deliveryCharge).toBe(9900); // ₹2,100 − ₹210 = ₹1,890
  });
  it('reports the whole-rupee shortfall for the free-delivery nudge', () => {
    expect(computeQuote(wx1Input({ ...base, lines: [line(150000)] })).freeDeliveryShortfall).toBe(50000);
    expect(computeQuote(wx1Input({ ...base, lines: [line(199900)] })).freeDeliveryShortfall).toBe(100);
  });
  it('includes 18% tax on the delivery charge in the tax portion (SD-17)', () => {
    const q = computeQuote(wx1Input({ ...base, lines: [line(100000)] }));
    expect(q.total).toBe(109900);
    expect(q.taxPortion).toBe(15254 + 1510); // ₹1,000 at 18% + ₹99 at 18%
  });
  it('charges nothing for an empty bag', () => {
    const q = computeQuote(wx1Input({ ...base, lines: [] }));
    expect(q.deliveryCharge).toBe(0);
    expect(q.total).toBe(0);
  });
});

describe('PRC-006 bank offer states', () => {
  it('is "available" with its potential discount when not paying with HDFC (BAG-008)', () => {
    const q = computeQuote(wx1Input({ payment: { method: 'upi', useCredits: false } }));
    expect(q.bankOffer).toEqual({ state: 'available', potentialDiscount: 45400, minEligibleValue: 250000 });
    expect(q.total).toBe(521600);
  });
  it('needs the HDFC bank and an allowed card type', () => {
    const other = computeQuote(wx1Input({ payment: { method: 'card', card: { issuingBank: 'Other Bank', cardType: 'credit' } } }));
    expect(other.bankOffer.state).toBe('available');
    const debitOnly = computeQuote(wx1Input({ bankOffer: { ...HDFC, cardTypes: ['debit'] } }));
    expect(debitOnly.bankOffer.state).toBe('available');
  });
  it('is not eligible below the minimum, without eligible items, or when inactive', () => {
    expect(computeQuote(wx1Input({ lines: [LINE_A] })).bankOffer).toMatchObject({ state: 'not_eligible', reason: 'min_value' });
    expect(computeQuote(wx1Input({ lines: [LINE_C] })).bankOffer).toMatchObject({ state: 'not_eligible', reason: 'no_eligible_items' });
    expect(computeQuote(wx1Input({ bankOffer: { ...HDFC, active: false } })).bankOffer).toMatchObject({ state: 'not_eligible', reason: 'inactive' });
  });
  it('caps at ₹1,000', () => {
    const big: QuoteLineInput = { ...LINE_B, qty: 5, unitMrp: 2500000, unitPrice: 2400000 };
    expect(computeQuote(wx1Input({ lines: [big], coupon: null })).bankOfferDiscount).toBe(100000);
  });
});

describe('PRC-008/009 wallet and EC-08', () => {
  it('uses the gift card first, then credits', () => {
    const q = computeQuote(wx1Input({ payment: { method: 'upi', giftCard: { id: 'g1', balance: 100000, usable: true }, useCredits: true, creditBalance: 50000 } }));
    expect(q.wallet).toEqual({ giftCardId: 'g1', giftCard: 100000, credits: 50000 });
    expect(q.remainder).toBe(521600 - 150000);
  });
  it('ignores an unusable gift card', () => {
    const q = computeQuote(wx1Input({ payment: { method: 'upi', giftCard: { id: 'g1', balance: 100000, usable: false } } }));
    expect(q.wallet.giftCard).toBe(0);
    expect(q.wallet.giftCardId).toBeNull();
  });
  it('EC-08: credits cover everything → the bank offer is not applied and the remainder is ₹0', () => {
    const q = computeQuote(wx1Input({ payment: { method: 'card', card: { issuingBank: 'HDFC Bank', cardType: 'credit' }, useCredits: true, creditBalance: 1000000 } }));
    expect(q.bankOffer).toMatchObject({ state: 'not_eligible', reason: 'wallet_covers_total' });
    expect(q.bankOfferDiscount).toBe(0);
    expect(q.total).toBe(521600);
    expect(q.wallet.credits).toBe(521600);
    expect(q.remainder).toBe(0);
    expect(q.allowedMethods).toEqual([]);
    expect(q.methodError).toBe('METHOD_NOT_NEEDED');
  });
  it('PRC-011: COD only when 0 < remainder ≤ ₹10,000', () => {
    const big: QuoteLineInput = { ...LINE_C, qty: 2, unitMrp: 600000, unitPrice: 600000 };
    const q = computeQuote(wx1Input({ lines: [big], coupon: null, bankOffer: null, payment: { method: 'cod' } }));
    expect(q.remainder).toBe(1200000);
    expect(q.allowedMethods).toEqual(['card', 'upi']);
    expect(q.methodError).toBe('COD_NOT_ALLOWED');
  });
});

describe('quote invariants (property test)', () => {
  it('shares sum exactly and line nets plus delivery equal the total', () => {
    const rng = seededRandom(2026);
    for (let run = 0; run < 300; run += 1) {
      const lines: QuoteLineInput[] = Array.from({ length: randomIntBetween(rng, 1, 6) }, (_, i) => {
        const price = randomIntBetween(rng, 99, 9999) * 100;
        return {
          ...LINE_A,
          variantId: `v${i}`,
          qty: randomIntBetween(rng, 1, 10),
          unitPrice: price,
          unitMrp: price + randomIntBetween(rng, 0, 2000) * 100,
          bankOfferEligible: rng.next() < 0.6,
          nodeIds: rng.next() < 0.5 ? ['men'] : ['beauty'],
          taxRatePercent: rng.next() < 0.5 ? 5 : 18,
        };
      });
      const q = computeQuote({
        lines,
        coupon: { definition: { ...WELCOME10, maxDiscount: null, minEligibleValue: 0, eligibleNodeIds: rng.next() < 0.5 ? [] : ['men'] }, customerUses: 0 },
        bankOffer: HDFC,
        delivery: DELIVERY,
        payment: { method: 'card', card: { issuingBank: 'HDFC Bank', cardType: 'debit' } },
        now: NOW,
      });
      const sum = (k: 'couponShare' | 'bankOfferShare' | 'lineNet') => q.lines.reduce((s, l) => s + l[k], 0);
      expect(sum('couponShare')).toBe(q.couponDiscount);
      expect(sum('bankOfferShare')).toBe(q.bankOfferDiscount);
      expect(sum('lineNet') + q.deliveryCharge).toBe(q.total);
      expect(q.lines.every((l) => l.lineNet >= 0)).toBe(true);
      expect(q.couponDiscount % 100).toBe(0);
      expect(q.bankOfferDiscount % 100).toBe(0);
    }
  });
});

it('uses the same lines in the same order', () => {
  const q = computeQuote(wx1Input({ lines: [LINE_C, LINE_A] }));
  expect(q.lines.map((l) => l.variantId)).toEqual(['C', 'A']);
  expect(LINE_B.variantId).toBe('B');
});
