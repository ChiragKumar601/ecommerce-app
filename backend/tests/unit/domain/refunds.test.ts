import { describe, expect, it } from 'vitest';
import { allocateRefund, perUnitShares, unitsRefundAmount, type CapturedSource } from '../../../src/domain/refunds/allocate.js';

// WX-1 order: line nets A ₹1,700.23 (qty 2), B ₹2,381.87, C ₹679.90; card ₹4,262 + credits ₹500.
const WX_SOURCES = (cardRefunded = 0, creditsRefunded = 0): CapturedSource[] => [
  { source: 'credits', amount: 50000, refunded: creditsRefunded },
  { source: 'card', amount: 426200, refunded: cardRefunded },
];

describe('RFD-001 per-unit shares', () => {
  it('WX-2: ₹1,700.23 over 2 units → ₹850.11 and ₹850.12', () => {
    expect(perUnitShares(170023, 2)).toEqual([85011, 85012]);
    expect(unitsRefundAmount(170023, 2, 0, 1)).toBe(85011);
    expect(unitsRefundAmount(170023, 2, 1, 1)).toBe(85012);
    expect(unitsRefundAmount(170023, 2, 0, 2)).toBe(170023);
  });
  it('EC-11: refunding all units across two requests totals the line net', () => {
    const net = 100001;
    expect(unitsRefundAmount(net, 3, 0, 2) + unitsRefundAmount(net, 3, 2, 1)).toBe(net);
  });
  it('rejects impossible unit ranges', () => {
    expect(() => unitsRefundAmount(1000, 2, 1, 2)).toThrow(RangeError);
    expect(() => perUnitShares(1000, 0)).toThrow(RangeError);
  });
});

describe('RFD-002 destinations', () => {
  it('WX-2: the first unit of A → ₹850.11 to the card', () => {
    expect(allocateRefund(85011, WX_SOURCES())).toEqual({ amount: 85011, destinations: [{ destination: 'card', amount: 85011 }] });
  });
  it('WX-3: cancelling C → ₹679.90 to the card', () => {
    expect(allocateRefund(67990, WX_SOURCES()).destinations).toEqual([{ destination: 'card', amount: 67990 }]);
  });
  it('WX-4: cancelling all three lines in turn → card ₹4,262 then credits ₹500', () => {
    const r1 = allocateRefund(170023, WX_SOURCES());
    const r2 = allocateRefund(238187, WX_SOURCES(170023));
    const r3 = allocateRefund(67990, WX_SOURCES(170023 + 238187));
    expect(r1.destinations).toEqual([{ destination: 'card', amount: 170023 }]);
    expect(r2.destinations).toEqual([{ destination: 'card', amount: 238187 }]);
    expect(r3.destinations).toEqual([
      { destination: 'card', amount: 17990 },
      { destination: 'credits', amount: 50000 },
    ]);
    const card = [r1, r2, r3].flatMap((r) => r.destinations).filter((d) => d.destination === 'card').reduce((s, d) => s + d.amount, 0);
    expect(card).toBe(426200);
  });
  it('orders card/UPI → gift card → credits, and refunds an expired gift card as credits (RFD-004)', () => {
    const sources: CapturedSource[] = [
      { source: 'credits', amount: 20000, refunded: 0 },
      { source: 'gift_card', amount: 30000, refunded: 0, accountGiftCardId: 'g1' },
      { source: 'upi', amount: 10000, refunded: 0 },
    ];
    expect(allocateRefund(55000, sources).destinations).toEqual([
      { destination: 'upi', amount: 10000 },
      { destination: 'gift_card', amount: 30000, accountGiftCardId: 'g1' },
      { destination: 'credits', amount: 15000 },
    ]);
    const expired = sources.map((s) => (s.source === 'gift_card' ? { ...s, giftCardExpired: true } : s));
    expect(allocateRefund(40000, expired).destinations).toEqual([
      { destination: 'upi', amount: 10000 },
      { destination: 'credits', amount: 30000, note: 'gift_card_expired' },
    ]);
  });
  it('refunds collected COD as credits, after the wallet portions', () => {
    const sources: CapturedSource[] = [
      { source: 'cod', amount: 300000, refunded: 0 },
      { source: 'credits', amount: 50000, refunded: 0 },
    ];
    expect(allocateRefund(320000, sources).destinations).toEqual([
      { destination: 'credits', amount: 50000 },
      { destination: 'credits', amount: 270000, note: 'cod_refund' },
    ]);
  });
  it('EC-09: rejected COD order with a wallet part → only captured wallet amounts come back', () => {
    const sources: CapturedSource[] = [
      { source: 'gift_card', amount: 100000, refunded: 0, accountGiftCardId: 'g1' },
      { source: 'credits', amount: 50000, refunded: 0 },
      { source: 'cod', amount: 0, refunded: 0 }, // never collected
    ];
    const r = allocateRefund(500000, sources); // whole-order refund incl. delivery
    expect(r.amount).toBe(150000);
    expect(r.destinations).toEqual([
      { destination: 'gift_card', amount: 100000, accountGiftCardId: 'g1' },
      { destination: 'credits', amount: 50000 },
    ]);
  });
  it('RFD-007: never refunds more than was captured plus collected', () => {
    const r = allocateRefund(999999, WX_SOURCES(400000, 50000));
    expect(r.amount).toBe(26200);
    expect(allocateRefund(1, WX_SOURCES(426200, 50000))).toEqual({ amount: 0, destinations: [] });
    expect(() => allocateRefund(-1, WX_SOURCES())).toThrow(RangeError);
  });
});
