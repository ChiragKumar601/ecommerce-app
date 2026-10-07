import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { advanceOrders, expireHandovers } from '../src/services/orders/fulfilment.js';
import { seedCatalogueFixture } from './helpers/catalogueFixture.js';
import { ORDER_FIXTURE, orderHelpers, type Agent } from './helpers/orders.js';
import { createTestApp } from './helpers/testApp.js';

const STEP = 120_000; // sim.statusStepInterval (SD-19)
const HANDOVER = 600_000; // sim.deliveryHandoverWindow

describe('fulfilment, orders and the delivery simulator (S16)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let h: ReturnType<typeof orderHelpers>;
  const step = async () => {
    t.clock.advance(STEP);
    return advanceOrders(t.ctx);
  };
  const statusOf = async (id: string) => (await t.ctx.db.order.findUniqueOrThrow({ where: { id } })).status;
  /** Steps an order to Out for Delivery (attempt 1). */
  const toOutForDelivery = async (id: string) => {
    for (let i = 0; i < 4; i++) await step();
    expect(await statusOf(id)).toBe('OUT_FOR_DELIVERY');
  };
  const otpOf = async (id: string) => (await t.ctx.db.order.findUniqueOrThrow({ where: { id } })).deliveryOtp!;
  const wrong = (otp: string) => String((Number(otp) + 1) % 10_000).padStart(4, '0');
  const confirm = (a: Agent, id: string, otp: string) => h.send(a, 'post', `/orders/${id}/delivery-sim/confirm`, { otp });
  // Restock checks use a product no other test orders, since the scheduler moves every due order.
  const onHand = async (variantId: string) => (await t.ctx.db.inventory.findUniqueOrThrow({ where: { variantId } })).onHand;

  beforeAll(async () => {
    t = await createTestApp({ seed: (ctx) => seedCatalogueFixture(ctx.db, ORDER_FIXTURE) });
    h = orderHelpers(t);
    // The fixture doesn't derive returnability; Beauty is non-returnable (R-17).
    await t.ctx.db.product.update({ where: { id: 'p-ser' }, data: { returnable: false } });
  }, 120_000);
  afterAll(async () => t.cleanup());
  beforeEach(() => t.clock.advance(61_000));

  it('advances Placed → Confirmed → Packed → Shipped → Out for Delivery one step per interval, with events, tracking and the unseen flag (ORD-004, T-14)', async () => {
    const a = await h.customer();
    const id = await h.placeOrder(a, [['p-tee-v0', 1]]);
    expect(await statusOf(id)).toBe('PLACED');
    t.clock.advance(STEP - 1000);
    await advanceOrders(t.ctx);
    expect(await statusOf(id)).toBe('PLACED'); // not yet due
    t.clock.advance(1000);
    await advanceOrders(t.ctx);
    expect(await advanceOrders(t.ctx)).toBe(0); // safe to run twice (API-007)
    expect(await statusOf(id)).toBe('CONFIRMED');
    expect((await a.get('/api/v1/auth/session')).body.hasUnseenOrderUpdates).toBe(true);
    await step();
    let o = await h.order(a, id);
    expect(o).toMatchObject({ status: 'PACKED', tracking: null, deliveryOtp: null, simulator: null });
    await step();
    o = await h.order(a, id);
    expect(o.status).toBe('SHIPPED');
    expect(o.tracking).toMatchObject({ courier: expect.stringMatching(/\(demo\)$/), trackingId: expect.stringMatching(/^TRK[A-Z0-9]{10}$/) });
    await step();
    o = await h.order(a, id);
    expect(o).toMatchObject({ status: 'OUT_FOR_DELIVERY', deliveryOtp: expect.stringMatching(/^\d{4}$/), simulator: { attempt: 1, triesLeft: 5, locked: false } });
    expect(o.timeline.map((e: { status: string; actor: string }) => `${e.status}:${e.actor}`)).toEqual([
      'AWAITING_PAYMENT:customer', 'PLACED:customer', 'CONFIRMED:scheduler', 'PACKED:scheduler', 'SHIPPED:scheduler', 'OUT_FOR_DELIVERY:scheduler',
    ]);
    // Opening the order clears the dot (PRF-007).
    h.ok(await h.send(a, 'post', `/orders/${id}/seen`));
    expect((await a.get('/api/v1/auth/session')).body.hasUnseenOrderUpdates).toBe(false);
  });

  it('correct OTP → Delivered: return windows set, COD collected (DLV-003, UF-07)', async () => {
    const a = await h.customer();
    const id = await h.placeOrder(a, [['p-tee-v0', 1], ['p-ser-v0', 1]]);
    await toOutForDelivery(id);
    expect(h.ok(await confirm(a, id, await otpOf(id)))).toMatchObject({ status: 'DELIVERED', payment: { codDue: null, codCollected: { display: '₹1,817' } } });
    const lines = await t.ctx.db.orderLine.findMany({ where: { orderId: id } });
    const tee = lines.find((l) => l.variantId === 'p-tee-v0')!;
    const serum = lines.find((l) => l.variantId === 'p-ser-v0')!;
    expect(tee.returnWindowEndsAt!.getTime() - t.clock.now().getTime()).toBe(14 * 86_400_000);
    expect(serum.returnWindowEndsAt).toBeNull(); // Beauty isn't returnable (R-17)
    expect((await confirm(a, id, await otpOf(id))).body.code).toBe('ACTION_NOT_ALLOWED');
  });

  it('wrong OTPs: "Incorrect OTP", then locked after 5; the attempt fails and attempt 2 keeps the same OTP (DLV-004, DLV-006)', async () => {
    const a = await h.customer();
    const id = await h.placeOrder(a, [['p-tee-v0', 1]]);
    await toOutForDelivery(id);
    const otp = await otpOf(id);
    for (let i = 0; i < 4; i++) expect((await confirm(a, id, wrong(otp))).body).toMatchObject({ code: 'OTP_INCORRECT', message: 'Incorrect OTP' });
    expect((await confirm(a, id, wrong(otp))).body).toMatchObject({ code: 'OTP_LOCKED', message: 'Too many incorrect OTPs. Delivery will be re-attempted.' });
    expect(await statusOf(id)).toBe('DELIVERY_ATTEMPT_FAILED');
    await step();
    const o = await h.order(a, id);
    expect(o).toMatchObject({ status: 'OUT_FOR_DELIVERY', simulator: { attempt: 2, triesLeft: 5 }, deliveryOtp: otp });
    h.ok(await confirm(a, id, otp));
    expect(await statusOf(id)).toBe('DELIVERED');
  });

  it('EC-22: the 5th wrong OTP on attempt 2 → Returned to Origin straight away, restocked', async () => {
    const a = await h.customer();
    const before = await onHand('p-cap-v0');
    const id = await h.placeOrder(a, [['p-cap-v0', 2]]);
    expect(await onHand('p-cap-v0')).toBe(before - 2);
    await toOutForDelivery(id);
    t.clock.advance(HANDOVER);
    await expireHandovers(t.ctx);
    await step();
    expect((await h.order(a, id)).simulator.attempt).toBe(2);
    const otp = await otpOf(id);
    for (let i = 0; i < 5; i++) await confirm(a, id, wrong(otp));
    expect(await statusOf(id)).toBe('RETURNED_TO_ORIGIN');
    expect(await onHand('p-cap-v0')).toBe(before);
  });

  it('UF-09: no action → Delivery Attempt Failed → Out for Delivery → Returned to Origin; COD no longer due (DLV-006)', async () => {
    const a = await h.customer();
    const before = await onHand('p-sock-v0');
    const id = await h.placeOrder(a, [['p-sock-v0', 1]]);
    await toOutForDelivery(id);
    t.clock.advance(HANDOVER - 1000);
    await expireHandovers(t.ctx);
    expect(await statusOf(id)).toBe('OUT_FOR_DELIVERY'); // the window hasn't ended yet
    t.clock.advance(1000);
    await expireHandovers(t.ctx);
    expect(await statusOf(id)).toBe('DELIVERY_ATTEMPT_FAILED');
    await step();
    expect(await statusOf(id)).toBe('OUT_FOR_DELIVERY');
    t.clock.advance(HANDOVER);
    await expireHandovers(t.ctx);
    const o = await h.order(a, id);
    expect(o).toMatchObject({ status: 'RETURNED_TO_ORIGIN', payment: { codDue: null } });
    expect(o.timeline.at(-1)).toMatchObject({ status: 'RETURNED_TO_ORIGIN', actor: 'scheduler' });
    expect(await onHand('p-sock-v0')).toBe(before);
  });

  it('Customer rejected parcel → Rejected at Delivery, restocked (DLV-005, UF-08)', async () => {
    const a = await h.customer();
    const before = await onHand('p-belt-v0');
    const id = await h.placeOrder(a, [['p-belt-v0', 1]], 'upi');
    await toOutForDelivery(id);
    const o = h.ok(await h.send(a, 'post', `/orders/${id}/delivery-sim/reject`));
    expect(o).toMatchObject({ status: 'REJECTED_AT_DELIVERY', simulator: null });
    expect(o.timeline.at(-1).actor).toBe('delivery_simulator');
    expect(await onHand('p-belt-v0')).toBe(before);
  });

  it('API-008: a customer action racing the scheduler applies exactly one transition', async () => {
    const a = await h.customer();
    const id = await h.placeOrder(a, [['p-tee-v0', 1]]);
    await toOutForDelivery(id);
    t.clock.advance(HANDOVER);
    const otp = await otpOf(id);
    const [r] = await Promise.all([confirm(a, id, otp), expireHandovers(t.ctx)]);
    const status = await statusOf(id);
    // Either the OTP landed first (Delivered) or the window closed first (attempt failed, OTP refused).
    if (r.status === 200) expect(status).toBe('DELIVERED');
    else {
      expect(r.body.code).toBe('ACTION_NOT_ALLOWED');
      expect(status).toBe('DELIVERY_ATTEMPT_FAILED');
    }
    const events = await t.ctx.db.orderStatusEvent.findMany({ where: { orderId: id, fromStatus: 'OUT_FOR_DELIVERY' } });
    expect(events).toHaveLength(1);
  });

  it('orders list: own orders newest first, 10 per page, headline, first item and total (ORD-002); simulator is owner-only', async () => {
    const a = await h.customer();
    const ids: string[] = [];
    for (let i = 0; i < 11; i++) {
      t.clock.advance(1000);
      ids.push(await h.placeOrder(a, [['p-ser-v0', 1]]));
    }
    const p1 = h.ok(await a.get('/api/v1/orders'));
    expect(p1).toMatchObject({ totalCount: 11, pageCount: 2 });
    expect(p1.items).toHaveLength(10);
    expect(p1.items[0]).toMatchObject({ id: ids[10], headline: 'Placed', firstItem: 'Glowly Face Serum', moreCount: 0, total: { display: '₹818' } });
    expect((await a.get('/api/v1/orders?page=2')).body.items.map((x: { id: string }) => x.id)).toEqual([ids[0]]);
    const other = await h.customer();
    expect((await other.get('/api/v1/orders')).body.items).toEqual([]);
    expect((await h.send(other, 'post', `/orders/${ids[0]}/delivery-sim/confirm`, { otp: '1234' })).body.code).toBe('NOT_FOUND');
    expect((await h.send(other, 'post', `/orders/${ids[0]}/seen`)).body.code).toBe('NOT_FOUND');
  });
});
