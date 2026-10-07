import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { advanceOrders } from '../src/services/orders/fulfilment.js';
import { completeRefunds } from '../src/services/orders/refunds.js';
import { advanceReturns } from '../src/services/orders/returns.js';
import { seedCatalogueFixture } from './helpers/catalogueFixture.js';
import { ORDER_FIXTURE, orderHelpers, type Agent } from './helpers/orders.js';
import { createTestApp } from './helpers/testApp.js';

const STEP = 120_000;
const DAY = 86_400_000;

describe('returns (S18)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let h: ReturnType<typeof orderHelpers>;
  const tick = async () => {
    t.clock.advance(STEP);
    await advanceOrders(t.ctx);
    await advanceReturns(t.ctx);
    await completeRefunds(t.ctx);
  };
  /** Steps an order to Out for Delivery and confirms the OTP. */
  const deliver = async (a: Agent, id: string) => {
    for (let i = 0; i < 4; i++) {
      t.clock.advance(STEP);
      await advanceOrders(t.ctx);
    }
    const otp = (await t.ctx.db.order.findUniqueOrThrow({ where: { id } })).deliveryOtp!;
    h.ok(await h.send(a, 'post', `/orders/${id}/delivery-sim/confirm`, { otp }));
  };
  const line = (o: { lines: { id: string; variantId: string }[] }, v: string) => o.lines.find((l) => l.variantId === v)! as unknown as { id: string; returnInfo: { canReturn: boolean; returnableQty: number; message: string | null; returns: { status: string; statusLabel: string; rejectionReason: string | null; closedMessage: string | null; refund: { paise: number } | null; history: { status: string }[] }[] } };
  const ret = (a: Agent, id: string, lineId: string, quantity: number, comment = '', reason = 'Size too small', key?: string) =>
    h.send(a, 'post', `/orders/${id}/lines/${lineId}/returns`, { quantity, reason, comment }, key);
  const statusTrail = async (a: Agent, id: string, lineId: string, steps: number) => {
    for (let i = 0; i < steps; i++) await tick();
    return line(await h.order(a, id), (await t.ctx.db.orderLine.findUniqueOrThrow({ where: { id: lineId } })).variantId).returnInfo.returns;
  };

  beforeAll(async () => {
    t = await createTestApp({ seed: (ctx) => seedCatalogueFixture(ctx.db, ORDER_FIXTURE) });
    h = orderHelpers(t);
    await t.ctx.db.product.update({ where: { id: 'p-ser' }, data: { returnable: false } });
  }, 120_000);
  afterAll(async () => t.cleanup());
  beforeEach(() => t.clock.advance(61_000));

  it('WX-2 + UF-11 (#approve): return 1 of 2 T-shirts → Requested … Picked Up → ₹850.11 to the card → Refunded; stock back (RET-002, RET-003, RET-007)', async () => {
    const a = await h.customer();
    const id = await h.placeWx1Order(a);
    let o = await h.order(a, id);
    const tee = line(o, 'p-tee-v0');
    expect(tee.returnInfo).toMatchObject({ canReturn: false, returnableQty: 0 }); // not delivered yet
    expect((await ret(a, id, tee.id, 1)).body.code).toBe('ACTION_NOT_ALLOWED');
    await deliver(a, id);
    o = await h.order(a, id);
    expect(line(o, 'p-tee-v0').returnInfo).toMatchObject({ canReturn: true, returnableQty: 2, message: expect.stringMatching(/^Return by /) });
    expect(line(o, 'p-ser-v0').returnInfo).toMatchObject({ canReturn: false, message: 'Not returnable' });

    const preview = h.ok(await a.get(`/api/v1/orders/${id}/lines/${tee.id}/return-preview?quantity=1`));
    expect(preview).toMatchObject({ returnableQty: 2, refund: { amount: { display: '₹850.11' }, destinations: [{ label: 'Visa •••• 0009' }] } });
    o = h.ok(await ret(a, id, tee.id, 1, 'Too tight #approve', 'Size too small', 'return-wx2-0001'), 201);
    h.ok(await ret(a, id, tee.id, 1, 'Too tight #approve', 'Size too small', 'return-wx2-0001'), 201); // same key: no second return
    expect(line(o, 'p-tee-v0').returnInfo).toMatchObject({ returnableQty: 1, returns: [{ status: 'RETURN_REQUESTED' }] });
    const stock = (await t.ctx.db.inventory.findUniqueOrThrow({ where: { variantId: 'p-tee-v0' } })).onHand;

    const r = await statusTrail(a, id, tee.id, 5);
    expect(r[0]!.history.map((x) => x.status)).toEqual(['RETURN_REQUESTED', 'RETURN_APPROVED', 'PICKUP_SCHEDULED', 'PICKED_UP', 'REFUND_INITIATED', 'REFUNDED']);
    expect(r[0]).toMatchObject({ statusLabel: 'Refunded', refund: { paise: 85011 } });
    expect((await t.ctx.db.inventory.findUniqueOrThrow({ where: { variantId: 'p-tee-v0' } })).onHand).toBe(stock + 1);
    o = await h.order(a, id);
    expect(o.headline).toBe('Delivered · 1 item returned');
    expect(o.refunds.at(-1)).toMatchObject({ trigger: 'return', summary: '₹850.11 to Visa •••• 0009', status: 'refunded' });
    expect(await advanceReturns(t.ctx)).toBe(0); // safe to run twice
  });

  it('EC-11: both units of a line returned in two requests → refunds total exactly the line net paid', async () => {
    const a = await h.customer();
    const id = await h.placeWx1Order(a);
    await deliver(a, id);
    const tee = line(await h.order(a, id), 'p-tee-v0');
    h.ok(await ret(a, id, tee.id, 1, '#approve'), 201);
    await tick();
    h.ok(await ret(a, id, tee.id, 1, '#approve'), 201);
    for (let i = 0; i < 6; i++) await tick();
    const refunds = await t.ctx.db.refund.findMany({ where: { orderId: id, trigger: 'return' }, orderBy: { createdAt: 'asc' } });
    expect(refunds.map((r) => r.amount)).toEqual([85011, 85012]);
    expect(refunds.reduce((n, r) => n + r.amount, 0)).toBe(170023);
    expect(line(await h.order(a, id), 'p-tee-v0').returnInfo).toMatchObject({ canReturn: false, returnableQty: 0 });
  });

  it('EC-10: a partial return that takes the order below ₹1,999 deducts no delivery charge (RFD-003)', async () => {
    const a = await h.customer();
    const id = await h.placeOrder(a, [['p-tee-v0', 2], ['p-sock-v0', 1]], 'upi');
    const o0 = await h.order(a, id);
    expect(o0.amounts.deliveryCharge.paise).toBe(0); // ₹2,397 > ₹1,999
    await deliver(a, id);
    const tee = line(await h.order(a, id), 'p-tee-v0');
    h.ok(await ret(a, id, tee.id, 2, '#approve'), 201);
    for (let i = 0; i < 4; i++) await tick();
    const refund = await t.ctx.db.refund.findFirstOrThrow({ where: { orderId: id, trigger: 'return' } });
    expect(refund).toMatchObject({ amount: 199800, includesDeliveryCharge: false });
  });

  it('#reject: rejected with one of the stated reasons; those units can’t be returned again (RET-004)', async () => {
    const a = await h.customer();
    const id = await h.placeOrder(a, [['p-tee-v0', 2]], 'upi');
    await deliver(a, id);
    const tee = line(await h.order(a, id), 'p-tee-v0');
    h.ok(await ret(a, id, tee.id, 1, 'please #reject'), 201);
    const r = await statusTrail(a, id, tee.id, 1);
    expect(r[0]).toMatchObject({ status: 'RETURN_REJECTED', statusLabel: 'Return Rejected' });
    expect(['Item shows signs of use', 'Tags or packaging missing', "Item doesn't match our records"]).toContain(r[0]!.rejectionReason);
    expect(line(await h.order(a, id), 'p-tee-v0').returnInfo.returnableQty).toBe(1);
    expect((await ret(a, id, tee.id, 2)).body.code).toBe('ACTION_NOT_ALLOWED');
    await tick();
    expect(await t.ctx.db.refund.count({ where: { orderId: id, trigger: 'return' } })).toBe(0);
  });

  it('#pickupfail twice → Pickup Failed, rescheduled (attempt 2), then Return Closed; no refund; units used (RET-005)', async () => {
    const a = await h.customer();
    const id = await h.placeOrder(a, [['p-cap-v0', 1]], 'upi');
    await deliver(a, id);
    const cap = line(await h.order(a, id), 'p-cap-v0');
    h.ok(await ret(a, id, cap.id, 1, '#pickupfail'), 201);
    const r = await statusTrail(a, id, cap.id, 6);
    expect(r[0]!.history.map((x) => x.status)).toEqual(['RETURN_REQUESTED', 'RETURN_APPROVED', 'PICKUP_SCHEDULED', 'PICKUP_FAILED', 'PICKUP_SCHEDULED', 'RETURN_CLOSED']);
    expect(r[0]!.closedMessage).toBe("Pickup couldn't be completed after 2 attempts. Your return has been closed.");
    expect(await t.ctx.db.refund.count({ where: { orderId: id } })).toBe(0);
    expect(line(await h.order(a, id), 'p-cap-v0').returnInfo).toMatchObject({ canReturn: false, returnableQty: 0 });
  });

  it('the 14-day window: "Return window closed on <date>" afterwards (RET-001, T-8)', async () => {
    const a = await h.customer();
    const id = await h.placeOrder(a, [['p-belt-v0', 1]], 'upi');
    await deliver(a, id);
    const belt = line(await h.order(a, id), 'p-belt-v0');
    // 14 days on (moved in the data, so the login session's own expiry doesn't interfere).
    const ends = (await t.ctx.db.orderLine.findUniqueOrThrow({ where: { id: belt.id } })).returnWindowEndsAt!;
    expect(ends.getTime() - t.clock.now().getTime()).toBeGreaterThan(14 * DAY - STEP * 6);
    await t.ctx.db.orderLine.update({ where: { id: belt.id }, data: { returnWindowEndsAt: new Date(t.clock.now().getTime() - 1) } });
    const info = line(await h.order(a, id), 'p-belt-v0').returnInfo;
    expect(info).toMatchObject({ canReturn: false, message: expect.stringMatching(/^Return window closed on \w{3}, \d{1,2} \w{3} 2026$/) });
    expect((await ret(a, id, belt.id, 1)).body.code).toBe('ACTION_NOT_ALLOWED');
  });

  it('validation and ownership', async () => {
    const a = await h.customer();
    const id = await h.placeOrder(a, [['p-sock-v0', 1]], 'upi');
    await deliver(a, id);
    const sock = line(await h.order(a, id), 'p-sock-v0');
    expect((await h.send(a, 'post', `/orders/${id}/lines/${sock.id}/returns`, { quantity: 1, reason: 'Bored' })).status).toBe(422);
    expect((await h.send(a, 'post', `/orders/${id}/lines/${sock.id}/returns`, { quantity: 1, reason: 'Other', comment: 'x'.repeat(501) })).status).toBe(422);
    const b = await h.customer();
    expect((await ret(b, id, sock.id, 1)).body.code).toBe('NOT_FOUND');
    expect((await b.get(`/api/v1/orders/${id}/lines/${sock.id}/return-preview`)).body.code).toBe('NOT_FOUND');
  });
});
