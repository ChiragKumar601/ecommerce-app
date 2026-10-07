import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { expirePayments, resolvePaymentAttempts } from '../src/services/payment.js';
import { seedCatalogueFixture, type FxProduct } from './helpers/catalogueFixture.js';
import { createTestApp, TEST_ORIGIN } from './helpers/testApp.js';

type Agent = ReturnType<typeof request.agent>;
type Res = Awaited<ReturnType<Agent['get']>>;

const HDFC_SUCCESS = '4000000110000009';
const HDFC_FAILURE = '4000000120000007';
const HDFC_RANDOM = '4000000100000001';

// spec §15 setup: T-shirt ₹999 × 2, sneakers ₹2,799, face serum ₹719 (WX-1).
const FIXTURE: FxProduct[] = [
  { id: 'p-tee', name: 'Crew T-shirt', brand: 'Northlane', nodes: ['men/topwear/t-shirts'], variants: [{ size: 'M', mrp: 1499, price: 999, stock: 50 }], bankOffer: true },
  { id: 'p-snk', name: 'Runner Sneakers', brand: 'Kestrel', nodes: ['men/footwear/sneakers'], variants: [{ size: '9', mrp: 3999, price: 2799, stock: 50 }], bankOffer: true },
  { id: 'p-ser', name: 'Face Serum', brand: 'Glowly', gender: 'none', nodes: ['beauty/skincare/serum'], variants: [{ size: 'One Size', mrp: 899, price: 719, stock: 50 }] },
  { id: 'p-last', name: 'Last Unit Jacket', brand: 'Kestrel', nodes: ['men/topwear/t-shirts'], variants: [{ size: 'L', mrp: 4999, price: 3999, stock: 1 }] },
  { id: 'p-big', name: 'Designer Coat', brand: 'Kestrel', nodes: ['men/topwear/t-shirts'], variants: [{ size: 'L', mrp: 15999, price: 12999, stock: 20 }] },
];

describe('payment and order creation (S15)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let n = 0;
  const send = (a: Agent, method: 'post' | 'put' | 'patch' | 'delete', path: string, body?: unknown, key?: string) => {
    const r = a[method](`/api/v1${path}`).set('Origin', TEST_ORIGIN);
    if (key) r.set('Idempotency-Key', key);
    return r.send(body as object);
  };
  const ok = (r: Res, status = 200) => {
    expect(r.status, JSON.stringify(r.body)).toBe(status);
    return r.body;
  };

  async function customer(): Promise<Agent> {
    const a = request.agent(t.app);
    ok(await send(a, 'post', '/auth/signup', { name: 'Kiran Rao', email: `pay${n}@example.com`, phone: `98${String(10_000_000 + n++).slice(-8)}`, password: 'secret123', confirmPassword: 'secret123', securityQuestionId: 'q1', securityAnswer: 'blue', ageConfirmed: true }), 201);
    ok(await send(a, 'post', '/me/addresses', { recipientName: 'Kiran Rao', recipientPhone: '9876543210', houseFlat: '1', streetArea: 'MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001', labelType: 'Home' }), 201);
    return a;
  }

  /** Bag → checkout → payment step; returns the checkout view after the payment selection. */
  async function checkoutAt(a: Agent, lines: [string, number][], selection: Record<string, unknown>, coupon?: string) {
    for (const [v, q] of lines) ok(await send(a, 'post', '/bag/lines', { variantId: v, quantity: q }));
    if (coupon) ok(await send(a, 'post', '/bag/coupon', { code: coupon }));
    const c = ok(await send(a, 'post', '/checkout', { source: 'bag' }), 201);
    ok(await send(a, 'put', `/checkout/${c.id}/step`, { step: 'payment' }));
    return ok(await send(a, 'put', `/checkout/${c.id}/payment-selection`, selection));
  }
  const newCard = (number: string, save = false) => ({ number, nameOnCard: 'Kiran Rao', expiry: '12/30', cvv: '123', save });
  const settle = async () => {
    t.clock.advance(3_100);
    await resolvePaymentAttempts(t.ctx);
  };
  const order = (a: Agent, id: string) => a.get(`/api/v1/orders/${id}`).then((r) => r.body);
  const inventory = (variantId: string) => t.ctx.db.inventory.findUniqueOrThrow({ where: { variantId } });

  beforeAll(async () => {
    t = await createTestApp({ seed: (ctx) => seedCatalogueFixture(ctx.db, FIXTURE) });
  }, 120_000);
  afterAll(async () => t.cleanup());
  beforeEach(() => t.clock.advance(61_000));

  it('WX-1 through the API: HDFC card + ₹500 credits → exact paise, Placed, stock committed, bag emptied (PAY-006…009, INV-002)', async () => {
    const a = await customer();
    const c = await checkoutAt(a, [['p-tee-v0', 2], ['p-snk-v0', 1], ['p-ser-v0', 1]], { useCredits: true, method: 'card', cardBin: '40000001' }, 'WELCOME10');
    expect(c.quote).toMatchObject({
      totalMrp: { paise: 789600 }, bagValue: { paise: 551600 }, couponDiscount: { paise: 30000 }, deliveryFree: true, bankOfferDiscount: { paise: 45400 },
      total: { paise: 476200 }, taxPortion: { paise: 29809 }, wallet: { credits: { paise: 50000 } }, remainder: { paise: 426200 },
    });
    const before = await inventory('p-tee-v0');
    const att = ok(await send(a, 'post', `/checkout/${c.id}/pay`, { quoteId: c.quoteId, payment: { useCredits: true, method: 'card', newCard: newCard(HDFC_SUCCESS) } }, 'pay-wx1-0001'), 201);
    expect(att).toMatchObject({ outcome: 'pending', message: 'Processing payment…', order: { status: 'AWAITING_PAYMENT' } });
    expect((await inventory('p-tee-v0')).held).toBe(before.held + 2);
    await settle();
    const o = await order(a, att.order.id);
    expect(o.orderNumber).toMatch(/^ORD-\d{6}-[A-Z0-9]{5}$/);
    expect(o.status).toBe('PLACED');
    const net = Object.fromEntries(o.lines.map((l: { variantId: string; lineNetPaid: { paise: number } }) => [l.variantId, l.lineNetPaid.paise]));
    expect(net).toEqual({ 'p-tee-v0': 170023, 'p-snk-v0': 238187, 'p-ser-v0': 67990 });
    expect(o.payment).toMatchObject({ paidOnline: { paise: 426200 }, credits: { paise: 50000 }, codDue: null });
    expect(o.expectedDelivery).toMatch(/^Delivery by /);
    expect(o.timeline.map((e: { status: string }) => e.status)).toEqual(['AWAITING_PAYMENT', 'PLACED']);
    const after = await inventory('p-tee-v0');
    expect(after).toMatchObject({ held: before.held, onHand: before.onHand - 2 });
    expect((await a.get('/api/v1/bag')).body.units).toBe(0);
    expect((await a.get('/api/v1/me/credits')).body.balance.paise).toBe(0);
    const row = await t.ctx.db.order.findUniqueOrThrow({ where: { id: att.order.id } });
    expect(row.deliveryOtp).toMatch(/^\d{4}$/);
  });

  it('QUOTE_CHANGED: a price change between quote and Pay rejects and changes nothing (PAY-006a, EC-02)', async () => {
    const a = await customer();
    const c = await checkoutAt(a, [['p-snk-v0', 1]], { method: 'upi' });
    await t.ctx.db.variant.update({ where: { id: 'p-snk-v0' }, data: { sellingPrice: 249900 } });
    try {
      const held = (await inventory('p-snk-v0')).held;
      const r = await send(a, 'post', `/checkout/${c.id}/pay`, { quoteId: c.quoteId, payment: { method: 'upi', upiId: 'success@demo' } });
      expect(r.body.code).toBe('QUOTE_CHANGED');
      expect(r.body.changes).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'PRICE_CHANGED', to: { paise: 249900, display: '₹2,499' } })]));
      expect((await inventory('p-snk-v0')).held).toBe(held);
      expect(await t.ctx.db.order.count({ where: { account: { phone: { not: null } }, lines: { some: { variantId: 'p-snk-v0' } }, status: 'AWAITING_PAYMENT' } })).toBe(0);
      // With the new quote, Pay goes through at the new price.
      const fresh = ok(await send(a, 'put', `/checkout/${c.id}/payment-selection`, { method: 'upi' }));
      const att = ok(await send(a, 'post', `/checkout/${fresh.id}/pay`, { quoteId: fresh.quoteId, payment: { method: 'upi', upiId: 'success@demo' } }), 201);
      expect(att.amount.paise).toBe(249900);
      await settle();
    } finally {
      await t.ctx.db.variant.update({ where: { id: 'p-snk-v0' }, data: { sellingPrice: 279900 } });
    }
  });

  it('INV-006 / EC-04: two customers paying for the last unit — only one hold succeeds', async () => {
    const [a, b] = [await customer(), await customer()];
    const ca = await checkoutAt(a, [['p-last-v0', 1]], { method: 'upi' });
    const cb = await checkoutAt(b, [['p-last-v0', 1]], { method: 'upi' });
    const [ra, rb] = await Promise.all([
      send(a, 'post', `/checkout/${ca.id}/pay`, { quoteId: ca.quoteId, payment: { method: 'upi', upiId: 'failure@demo' } }),
      send(b, 'post', `/checkout/${cb.id}/pay`, { quoteId: cb.quoteId, payment: { method: 'upi', upiId: 'failure@demo' } }),
    ]);
    const codes = [ra.status, rb.status].sort();
    expect(codes).toEqual([201, 409]);
    const loser = ra.status === 409 ? ra : rb;
    expect(loser.body.code).toBe('OUT_OF_STOCK');
    expect(await inventory('p-last-v0')).toMatchObject({ onHand: 1, held: 1 });
    // The unit shows as out of stock while held (EC-04).
    expect((await request(t.app).get('/api/v1/products/p-last')).body.variants[0].available).toBe(0);
  });

  it('PAY-007 / EC-05: the same idempotency key returns the same result; a new key gets PENDING_ORDER_EXISTS', async () => {
    const a = await customer();
    const c = await checkoutAt(a, [['p-tee-v0', 1]], { method: 'upi' });
    const body = { quoteId: c.quoteId, payment: { method: 'upi', upiId: 'failure@demo' } };
    const [r1, r2] = await Promise.all([send(a, 'post', `/checkout/${c.id}/pay`, body, 'same-key-0001'), send(a, 'post', `/checkout/${c.id}/pay`, body, 'same-key-0001')]);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r2.body.id).toBe(r1.body.id);
    const c2 = await checkoutAt(a, [], { method: 'upi' }).catch(() => null);
    expect(c2).toBeNull();
    const again = await send(a, 'post', '/bag/lines', { variantId: 'p-ser-v0' }).then(() => send(a, 'post', '/checkout', { source: 'bag' }));
    expect(again.body).toMatchObject({ code: 'PENDING_ORDER_EXISTS', details: { pending: { orderNumber: r1.body.order.orderNumber, minutesLeft: 15 } } });
    expect(await t.ctx.db.paymentAttempt.count({ where: { orderId: r1.body.order.id } })).toBe(1);
    await settle();
  });

  it('PAY-010, PAY-011, PAY-014: failure keeps the order; the card is saved anyway; retry with UPI succeeds, offer recomputed', async () => {
    const a = await customer();
    const c = await checkoutAt(a, [['p-snk-v0', 1]], { method: 'card', cardBin: '40000001' });
    expect(c.quote.bankOfferDiscount.paise).toBe(28000);
    const att = ok(await send(a, 'post', `/checkout/${c.id}/pay`, { quoteId: c.quoteId, payment: { method: 'card', newCard: newCard(HDFC_FAILURE, true) } }), 201);
    await settle();
    const status = ok(await a.get(`/api/v1/payment-attempts/${att.id}`));
    expect(status).toMatchObject({ outcome: 'failure', message: 'Payment failed. No money was taken.', order: { status: 'AWAITING_PAYMENT', canRetry: true } });
    expect((await a.get('/api/v1/me/cards')).body.items[0]).toMatchObject({ label: 'Visa •••• 0007' });
    const orderId = att.order.id as string;
    expect((await inventory('p-snk-v0')).held).toBeGreaterThan(0);

    const pq = ok(await send(a, 'post', `/orders/${orderId}/payment-quote`, { method: 'upi' }));
    expect(pq.quote.total.paise).toBe(279900); // no bank offer for UPI
    const r = ok(await send(a, 'post', `/orders/${orderId}/retry-payment`, { quoteId: pq.quoteId, payment: { method: 'upi', upiId: 'success@demo' } }, 'retry-key-0001'), 201);
    expect((await send(a, 'post', `/orders/${orderId}/retry-payment`, { quoteId: pq.quoteId, payment: { method: 'upi', upiId: 'success@demo' } })).body.code).toBe('PAYMENT_IN_PROGRESS');
    await settle();
    expect(ok(await a.get(`/api/v1/payment-attempts/${r.id}`)).outcome).toBe('success');
    const o = await order(a, orderId);
    expect(o).toMatchObject({ status: 'PLACED', amounts: { total: { paise: 279900 }, bankOfferDiscount: { paise: 0 } }, payment: { paidOnline: { paise: 279900 } } });
    expect((await send(a, 'post', `/orders/${orderId}/payment-quote`, { method: 'upi' })).body).toMatchObject({ code: 'ORDER_NOT_PAYABLE', message: 'This order can no longer be paid.' });
  });

  it('PAY-012: no success within 15 minutes → Failed, stock released, wallet reversed; EC-06: a processing attempt finishes first', async () => {
    const a = await customer();
    ok(await send(a, 'post', '/me/gift-cards/redeem', { code: 'DEMOGIFT500' }), 201);
    const gift = (await a.get('/api/v1/me/gift-cards')).body.items[0].id as string;
    const c = await checkoutAt(a, [['p-snk-v0', 1]], { giftCardId: gift, useCredits: true, method: 'card', cardBin: '51000003' });
    expect(c.quote.wallet).toMatchObject({ giftCard: { paise: 50000 }, credits: { paise: 50000 } });
    const held = (await inventory('p-snk-v0')).held;
    const att = ok(await send(a, 'post', `/checkout/${c.id}/pay`, { quoteId: c.quoteId, payment: { giftCardId: gift, useCredits: true, method: 'card', newCard: newCard('5100000320000001') } }), 201);
    expect((await a.get('/api/v1/me/credits')).body.balance.paise).toBe(0);
    await settle();
    t.clock.advance(15 * 60_000);
    expect(await expirePayments(t.ctx)).toBeGreaterThanOrEqual(1);
    const o = await order(a, att.order.id);
    expect(o.status).toBe('FAILED');
    expect((await inventory('p-snk-v0')).held).toBe(held);
    expect((await a.get('/api/v1/me/credits')).body.balance.paise).toBe(50000);
    expect((await a.get('/api/v1/me/gift-cards')).body.items[0]).toMatchObject({ balance: { paise: 50000 }, status: 'active' });
    expect(await expirePayments(t.ctx)).toBe(0); // safe to run twice (API-007)

    // EC-06: the window ends while an attempt is processing; it resolves first and the order is Placed.
    const b = await customer();
    const cb = await checkoutAt(b, [['p-ser-v0', 1]], { method: 'upi' });
    const atb = ok(await send(b, 'post', `/checkout/${cb.id}/pay`, { quoteId: cb.quoteId, payment: { method: 'upi', upiId: 'success@demo' } }), 201);
    await t.ctx.db.order.update({ where: { id: atb.order.id }, data: { retryEndsAt: t.clock.now() } });
    expect(await expirePayments(t.ctx)).toBe(0);
    await settle();
    expect((await order(b, atb.order.id)).status).toBe('PLACED');
  });

  it('UF-06 wallet only: gift card + credits cover everything → "Place order" with no simulator', async () => {
    const a = await customer();
    ok(await send(a, 'post', '/me/gift-cards/redeem', { code: 'DEMOGIFT5000' }), 201);
    const gift = (await a.get('/api/v1/me/gift-cards')).body.items[0].id as string;
    const c = await checkoutAt(a, [['p-snk-v0', 1]], { giftCardId: gift, useCredits: true, method: null });
    expect(c.quote).toMatchObject({ remainder: { paise: 0 }, allowedMethods: [] });
    // The gift card covers ₹2,799 alone, so credits aren't used.
    expect(c.quote.wallet).toMatchObject({ giftCard: { paise: 279900 }, credits: { paise: 0 } });
    const att = ok(await send(a, 'post', `/checkout/${c.id}/pay`, { quoteId: c.quoteId, payment: { giftCardId: gift, useCredits: true, method: null } }), 201);
    expect(att).toMatchObject({ outcome: 'success', method: 'none', order: { status: 'PLACED' } });
    expect((await order(a, att.order.id)).payment).toMatchObject({ giftCard: { paise: 279900 }, paidOnline: { paise: 0 } });
  });

  it('EC-08: the wallet covers the total, so the HDFC offer is not applied', async () => {
    const a = await customer();
    ok(await send(a, 'post', '/me/gift-cards/redeem', { code: 'DEMOGIFT5000' }), 201);
    const gift = (await a.get('/api/v1/me/gift-cards')).body.items[0].id as string;
    const c = await checkoutAt(a, [['p-snk-v0', 1]], { giftCardId: gift, useCredits: true, method: 'card', cardBin: '40000001' });
    expect(c.quote).toMatchObject({ bankOfferDiscount: { paise: 0 }, remainder: { paise: 0 } });
  });

  it('COD: Placed with cash due on delivery; refused above ₹10,000 (PRC-011, PAY-005)', async () => {
    const a = await customer();
    const c = await checkoutAt(a, [['p-ser-v0', 1]], { method: 'cod' });
    const att = ok(await send(a, 'post', `/checkout/${c.id}/pay`, { quoteId: c.quoteId, payment: { method: 'cod' } }), 201);
    expect(att.order.status).toBe('PLACED');
    expect((await order(a, att.order.id)).payment).toMatchObject({ codDue: { display: '₹818' } });
    const b = await customer();
    const cb = await checkoutAt(b, [['p-big-v0', 1]], { method: 'cod' });
    expect(cb.quote.allowedMethods).toEqual(['card', 'upi']);
    expect((await send(b, 'post', `/checkout/${cb.id}/pay`, { quoteId: cb.quoteId, payment: { method: 'cod' } })).body).toMatchObject({ code: 'COD_NOT_ALLOWED', message: 'Cash on Delivery is available for amounts up to ₹10,000.' });
  });

  it('EC-07: a gift card that expires between quote and Pay → QUOTE_CHANGED, removed from the selection', async () => {
    const a = await customer();
    ok(await send(a, 'post', '/me/gift-cards/redeem', { code: 'DEMOGIFT1000' }), 201);
    const gift = (await a.get('/api/v1/me/gift-cards')).body.items[0].id as string;
    const c = await checkoutAt(a, [['p-snk-v0', 1]], { giftCardId: gift, method: 'upi' });
    await t.ctx.db.accountGiftCard.update({ where: { id: gift }, data: { expiresAt: new Date(t.clock.now().getTime() - 1) } });
    const r = await send(a, 'post', `/checkout/${c.id}/pay`, { quoteId: c.quoteId, payment: { giftCardId: gift, method: 'upi', upiId: 'success@demo' } });
    expect(r.body.code).toBe('QUOTE_CHANGED');
    expect(r.body.changes).toEqual(expect.arrayContaining([{ type: 'GIFT_CARD_UNUSABLE', reason: 'expired' }]));
    expect((await a.get(`/api/v1/checkout/${c.id}`)).body.selection.giftCardId).toBeNull();
  });

  it('EC-24: the coupon limit reached by a parallel order removes the coupon at Pay', async () => {
    const a = await customer();
    const c1 = await checkoutAt(a, [['p-snk-v0', 1]], { method: 'cod' }, 'WELCOME10');
    const c2 = ok(await send(a, 'post', '/checkout', { source: 'buy_now', variantId: 'p-tee-v0', quantity: 2 }), 201);
    ok(await send(a, 'put', `/checkout/${c2.id}/coupon`, { code: 'WELCOME10' }));
    const q2 = ok(await send(a, 'put', `/checkout/${c2.id}/payment-selection`, { method: 'cod' }));
    ok(await send(a, 'post', `/checkout/${c1.id}/pay`, { quoteId: c1.quoteId, payment: { method: 'cod' } }), 201);
    const r = await send(a, 'post', `/checkout/${c2.id}/pay`, { quoteId: q2.quoteId, payment: { method: 'cod' } });
    expect(r.body.code).toBe('QUOTE_CHANGED');
    expect(r.body.changes).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'COUPON_REMOVED', code: 'WELCOME10', reason: 'limit_reached' })]));
  });

  it('NOT_TEST_CARD for real numbers; cancel a pending order releases everything (PAY-003, CNL-002)', async () => {
    const a = await customer();
    const c = await checkoutAt(a, [['p-tee-v0', 1]], { useCredits: true, method: 'card' });
    expect((await send(a, 'post', `/checkout/${c.id}/pay`, { quoteId: c.quoteId, payment: { useCredits: true, method: 'card', newCard: newCard('4111111111111111') } })).body.code).toBe('NOT_TEST_CARD');
    const att = ok(await send(a, 'post', `/checkout/${c.id}/pay`, { quoteId: c.quoteId, payment: { useCredits: true, method: 'card', newCard: newCard(HDFC_RANDOM) } }), 201);
    await settle();
    const o = await order(a, att.order.id);
    if (o.status === 'AWAITING_PAYMENT') {
      const held = (await inventory('p-tee-v0')).held;
      const cancelled = ok(await send(a, 'post', `/orders/${att.order.id}/cancel`, {}));
      expect(cancelled.status).toBe('CANCELLED');
      expect((await inventory('p-tee-v0')).held).toBe(held - 1);
      expect((await a.get('/api/v1/me/credits')).body.balance.paise).toBe(50000);
    } else {
      expect(o.status).toBe('PLACED');
      expect((await send(a, 'post', `/orders/${att.order.id}/cancel`, {})).body.code).toBe('ACTION_NOT_ALLOWED');
    }
  });

  it("someone else's order and attempt are NOT_FOUND (ORD-007, AUTHZ-002)", async () => {
    const a = await customer();
    const c = await checkoutAt(a, [['p-ser-v0', 1]], { method: 'cod' });
    const att = ok(await send(a, 'post', `/checkout/${c.id}/pay`, { quoteId: c.quoteId, payment: { method: 'cod' } }), 201);
    const b = await customer();
    expect((await b.get(`/api/v1/orders/${att.order.id}`)).body.code).toBe('NOT_FOUND');
    expect((await b.get(`/api/v1/payment-attempts/${att.id}`)).body.code).toBe('NOT_FOUND');
    expect((await send(b, 'post', `/orders/${att.order.id}/cancel`, {})).body.code).toBe('NOT_FOUND');
  });
});
