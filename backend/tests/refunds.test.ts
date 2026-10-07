import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { advanceOrders } from '../src/services/orders/fulfilment.js';
import { completeRefunds } from '../src/services/orders/refunds.js';
import { seedCatalogueFixture } from './helpers/catalogueFixture.js';
import { ORDER_FIXTURE, orderHelpers, type Agent } from './helpers/orders.js';
import { createTestApp } from './helpers/testApp.js';

const STEP = 120_000;

describe('refunds and cancellation (S17)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let h: ReturnType<typeof orderHelpers>;
  const step = async () => {
    t.clock.advance(STEP);
    await advanceOrders(t.ctx);
  };
  const lineOf = (o: { lines: { id: string; variantId: string }[] }, variantId: string) => o.lines.find((l) => l.variantId === variantId)!.id;
  const cancel = (a: Agent, orderId: string, lineId: string, reason = 'Changed my mind', key?: string) =>
    h.send(a, 'post', `/orders/${orderId}/lines/${lineId}/cancel`, { reason }, key);
  const settleRefunds = async () => {
    t.clock.advance(STEP);
    return completeRefunds(t.ctx);
  };
  const credits = async (a: Agent) => (await a.get('/api/v1/me/credits')).body.balance.paise as number;
  /** RFD-007: refunds never exceed what was captured plus collected. */
  const assertCap = async (orderId: string) => {
    const caught = await t.ctx.db.paymentAllocation.aggregate({ where: { orderId, status: { in: ['captured', 'cod_collected'] } }, _sum: { amount: true } });
    const refunded = await t.ctx.db.refund.aggregate({ where: { orderId }, _sum: { amount: true } });
    expect(refunded._sum.amount ?? 0).toBeLessThanOrEqual(caught._sum.amount ?? 0);
  };

  beforeAll(async () => {
    t = await createTestApp({ seed: (ctx) => seedCatalogueFixture(ctx.db, ORDER_FIXTURE) });
    h = orderHelpers(t);
  }, 120_000);
  afterAll(async () => t.cleanup());
  beforeEach(() => t.clock.advance(61_000));

  it('WX-3: cancel line C while Packed → ₹679.90 to the card; stock back; Refunded after one step (CNL-003, RFD-005)', async () => {
    const a = await h.customer();
    const id = await h.placeWx1Order(a);
    await step();
    await step();
    let o = await h.order(a, id);
    expect(o.status).toBe('PACKED');
    const serum = lineOf(o, 'p-ser-v0');
    const preview = h.ok(await a.get(`/api/v1/orders/${id}/lines/${serum}/cancel-preview`));
    expect(preview).toMatchObject({ lastLine: false, includesDeliveryCharge: false, refund: { amount: { display: '₹679.90' }, destinations: [{ label: 'Visa •••• 0009', amount: { display: '₹679.90' } }] } });
    const before = (await t.ctx.db.inventory.findUniqueOrThrow({ where: { variantId: 'p-ser-v0' } })).onHand;
    o = h.ok(await cancel(a, id, serum, 'Found a better price', 'cancel-wx3-0001'));
    expect(o.lines.find((l: { id: string }) => l.id === serum)).toMatchObject({ lineState: 'cancelled', canCancel: false, cancelled: { reason: 'Found a better price' } });
    expect(o.headline).toBe('Packed · 1 item cancelled');
    expect(o.refunds).toEqual([expect.objectContaining({ trigger: 'cancellation', amount: { paise: 67990, display: '₹679.90' }, summary: '₹679.90 to Visa •••• 0009', statusLabel: 'Refund Initiated' })]);
    expect((await t.ctx.db.inventory.findUniqueOrThrow({ where: { variantId: 'p-ser-v0' } })).onHand).toBe(before + 1);
    // Same idempotency key: no second refund.
    h.ok(await cancel(a, id, serum, 'Found a better price', 'cancel-wx3-0001'));
    expect(await t.ctx.db.refund.count({ where: { orderId: id } })).toBe(1);
    expect((await cancel(a, id, serum)).body.code).toBe('ACTION_NOT_ALLOWED');
    expect(await settleRefunds()).toBeGreaterThanOrEqual(1);
    expect(await completeRefunds(t.ctx)).toBe(0); // safe to run twice (API-007)
    expect((await h.order(a, id)).refunds[0]).toMatchObject({ status: 'refunded', statusLabel: 'Refunded', refundedAt: expect.any(String) });
    await assertCap(id);
  });

  it('WX-4: cancel all three lines while Packed → ₹4,762 in total: ₹4,262 card then ₹500 credits; order Cancelled (CNL-004)', async () => {
    const a = await h.customer();
    const id = await h.placeWx1Order(a);
    await step();
    await step();
    let o = await h.order(a, id);
    for (const v of ['p-tee-v0', 'p-snk-v0', 'p-ser-v0']) o = h.ok(await cancel(a, id, lineOf(o, v)));
    expect(o.status).toBe('CANCELLED');
    expect(o.refunds.map((r: { amount: { paise: number } }) => r.amount.paise)).toEqual([170023, 238187, 67990]);
    const total = o.refunds.reduce((n: number, r: { amount: { paise: number } }) => n + r.amount.paise, 0);
    expect(total).toBe(476200);
    const dest = await t.ctx.db.refundAllocation.groupBy({ by: ['destination'], where: { refund: { orderId: id } }, _sum: { amount: true } });
    expect(Object.fromEntries(dest.map((d) => [d.destination, d._sum.amount]))).toEqual({ card: 426200, credits: 50000 });
    expect(o.refunds.at(-1).summary).toBe('₹179.90 to Visa •••• 0009, ₹500 to Credits');
    expect(await credits(a)).toBe(0);
    await settleRefunds();
    expect(await credits(a)).toBe(50000); // credited at Refunded (RFD-005)
    await assertCap(id);
  });

  it('cancelling is refused from Shipped on (CNL-001); a cancel racing the Shipped step lands on one side (EC-12)', async () => {
    const a = await h.customer();
    const id = await h.placeOrder(a, [['p-tee-v0', 1], ['p-snk-v0', 1]], 'upi');
    await step();
    await step();
    let o = await h.order(a, id);
    t.clock.advance(STEP);
    const [r] = await Promise.all([cancel(a, id, lineOf(o, 'p-tee-v0')), advanceOrders(t.ctx)]);
    o = await h.order(a, id);
    const teeLine = o.lines.find((l: { variantId: string }) => l.variantId === 'p-tee-v0');
    if (r.status === 200) {
      expect(teeLine.lineState).toBe('cancelled');
      expect(o.timeline.findIndex((e: { status: string }) => e.status === 'SHIPPED')).toBeGreaterThan(-1);
    } else {
      expect(r.body.code).toBe('ACTION_NOT_ALLOWED');
      expect(teeLine.lineState).toBe('active');
    }
    expect(o.status).toBe('SHIPPED');
    expect(o.lines.every((l: { canCancel: boolean }) => !l.canCancel)).toBe(true);
    expect((await cancel(a, id, lineOf(o, 'p-snk-v0'))).body).toMatchObject({ code: 'ACTION_NOT_ALLOWED', message: "This action isn't available for this order anymore." });
  });

  it('COD: cancelling a line only reduces the amount due; the last line cancels the order with nothing refunded (RFD-002)', async () => {
    const a = await h.customer();
    const id = await h.placeOrder(a, [['p-tee-v0', 1], ['p-sock-v0', 1]]);
    let o = await h.order(a, id);
    expect(o.payment.codDue.paise).toBe(o.amounts.total.paise);
    const preview = h.ok(await a.get(`/api/v1/orders/${id}/lines/${lineOf(o, 'p-sock-v0')}/cancel-preview`));
    expect(preview).toMatchObject({ refund: { amount: { paise: 0 } }, codNoLongerDue: { display: '₹399' } });
    o = h.ok(await cancel(a, id, lineOf(o, 'p-sock-v0')));
    expect(o.payment.codDue.display).toBe('₹1,098'); // ₹999 + ₹99 delivery
    expect(o.refunds).toEqual([]);
    o = h.ok(await cancel(a, id, lineOf(o, 'p-tee-v0')));
    expect(o).toMatchObject({ status: 'CANCELLED', refunds: [], payment: { codDue: null } });
  });

  it('UF-08: a prepaid parcel rejected at delivery refunds the whole order including delivery to the original method (DLV-005, RFD-003)', async () => {
    const a = await h.customer();
    const id = await h.placeOrder(a, [['p-sock-v0', 1]], 'upi');
    for (let i = 0; i < 4; i++) await step();
    const o = h.ok(await h.send(a, 'post', `/orders/${id}/delivery-sim/reject`));
    expect(o.status).toBe('REJECTED_AT_DELIVERY');
    expect(o.refunds).toEqual([expect.objectContaining({ trigger: 'rejected_at_delivery', triggerLabel: 'Rejected at delivery', includesDeliveryCharge: true, amount: { paise: 49800, display: '₹498' }, summary: '₹498 to success@demo' })]);
    await assertCap(id);
  });

  it('EC-09: wallet + COD rejected at delivery → only the captured wallet part is refunded; COD no longer due', async () => {
    const a = await h.customer();
    for (const [v, q] of [['p-belt-v0', 1]] as const) h.ok(await h.send(a, 'post', '/bag/lines', { variantId: v, quantity: q }));
    const c = h.ok(await h.send(a, 'post', '/checkout', { source: 'bag' }), 201);
    h.ok(await h.send(a, 'put', `/checkout/${c.id}/step`, { step: 'payment' }));
    const v = h.ok(await h.send(a, 'put', `/checkout/${c.id}/payment-selection`, { useCredits: true, method: 'cod' }));
    expect(v.quote.wallet.credits.paise).toBe(50000);
    const att = h.ok(await h.send(a, 'post', `/checkout/${c.id}/pay`, { quoteId: v.quoteId, payment: { useCredits: true, method: 'cod' } }), 201);
    const id = att.order.id as string;
    for (let i = 0; i < 4; i++) await step();
    const o = h.ok(await h.send(a, 'post', `/orders/${id}/delivery-sim/reject`));
    expect(o.refunds[0]).toMatchObject({ amount: { display: '₹500' }, summary: '₹500 to Credits' });
    expect(o.payment.codDue).toBeNull();
    await settleRefunds();
    expect(await credits(a)).toBe(50000);
    await assertCap(id);
  });

  it('RFD-004: a gift card that expired before the refund completes is refunded as credits', async () => {
    const a = await h.customer();
    h.ok(await h.send(a, 'post', '/me/gift-cards/redeem', { code: 'DEMOGIFT5000' }), 201);
    const gift = (await a.get('/api/v1/me/gift-cards')).body.items[0].id as string;
    h.ok(await h.send(a, 'post', '/bag/lines', { variantId: 'p-cap-v0', quantity: 1 }));
    const c = h.ok(await h.send(a, 'post', '/checkout', { source: 'bag' }), 201);
    h.ok(await h.send(a, 'put', `/checkout/${c.id}/step`, { step: 'payment' }));
    const v = h.ok(await h.send(a, 'put', `/checkout/${c.id}/payment-selection`, { giftCardId: gift, method: null }));
    const att = h.ok(await h.send(a, 'post', `/checkout/${c.id}/pay`, { quoteId: v.quoteId, payment: { giftCardId: gift, method: null } }), 201);
    const id = att.order.id as string;
    let o = await h.order(a, id);
    o = h.ok(await cancel(a, id, o.lines[0].id));
    expect(o.refunds[0].summary).toMatch(/^₹698 to Gift card •••• 5000$/);
    await t.ctx.db.accountGiftCard.update({ where: { id: gift }, data: { expiresAt: new Date(t.clock.now().getTime() - 1) } });
    const creditsBefore = await credits(a);
    await settleRefunds();
    expect(await credits(a)).toBe(creditsBefore + 69800);
    const entry = await t.ctx.db.creditLedgerEntry.findFirstOrThrow({ where: { orderId: id, type: 'refund_credit' } });
    expect(entry.note).toBe('Gift card expired — refunded as credits');
    expect((await h.order(a, id)).refunds[0].summary).toBe('₹698 to Credits (gift card expired)');
  });

  it("someone else's order: preview and cancel are NOT_FOUND (ORD-007)", async () => {
    const a = await h.customer();
    const id = await h.placeOrder(a, [['p-tee-v0', 1]]);
    const line = (await h.order(a, id)).lines[0].id as string;
    const b = await h.customer();
    expect((await b.get(`/api/v1/orders/${id}/lines/${line}/cancel-preview`)).body.code).toBe('NOT_FOUND');
    expect((await cancel(b, id, line)).body.code).toBe('NOT_FOUND');
  });
});
