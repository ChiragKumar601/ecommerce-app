import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { listingFixture, seedCatalogueFixture } from './helpers/catalogueFixture.js';
import { createTestApp, TEST_ORIGIN } from './helpers/testApp.js';

type Agent = ReturnType<typeof request.agent>;

describe('bag, wishlist and merge (S11)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let n = 0;
  const send = (a: Agent, method: 'post' | 'patch' | 'delete', path: string, body?: unknown) => a[method](`/api/v1${path}`).set('Origin', TEST_ORIGIN).send(body as object);
  const guest = (body: unknown) => send(request.agent(t.app), 'post', '/bag/guest-quote', body);
  async function customer(guestData?: unknown): Promise<Agent> {
    const a = request.agent(t.app);
    const r = await send(a, 'post', '/auth/signup', {
      name: 'Bag Tester', email: `bag${n++}@example.com`, password: 'secret123', confirmPassword: 'secret123',
      securityQuestionId: 'q1', securityAnswer: 'blue', ageConfirmed: true, guest: guestData,
    });
    expect(r.status).toBe(201);
    return a;
  }
  const line = (variantId: string, quantity = 1, extra: object = {}) => ({ variantId, quantity, addedAt: Date.now(), ...extra });

  beforeAll(async () => {
    t = await createTestApp({ seed: (ctx) => seedCatalogueFixture(ctx.db, listingFixture()) });
  }, 120_000);
  afterAll(async () => t.cleanup());
  beforeEach(() => t.clock.advance(61_000));

  describe('guest quote (not stored)', () => {
    it('prices lines from the server: summary, tax line, free-delivery nudge (BAG-009, PRC-*)', async () => {
      const r = await guest({ lines: [line('p-foxtrot-v0', 2)], coupon: null });
      expect(r.status).toBe(200);
      expect(r.body.units).toBe(2);
      expect(r.body.quote).toMatchObject({
        totalMrp: { display: '₹1,598' }, discountOnMrp: { display: '₹600' }, bagValue: { display: '₹998' },
        deliveryCharge: { display: '₹99' }, total: { display: '₹1,097' }, freeDeliveryNudge: 'Add items worth ₹1,002 more for FREE delivery',
      });
      // Home is taxed at 18%: 998 × 18/118 = 152.24; delivery 99 × 18/118 = 15.10.
      expect(r.body.quote.taxText).toBe('Inclusive of ₹167.34 tax');
      expect(r.body.deviceLines[0]).toMatchObject({ variantId: 'p-foxtrot-v0', lastSeenUnitPrice: 49900 });
    });

    it('add caps at available with "Only n available", and at 10 with "Maximum 10 per item" (PDP-008)', async () => {
      const r = await guest({ lines: [line('p-charlie-v0', 1)], coupon: null, op: { type: 'add', variantId: 'p-charlie-v0' } });
      expect(r.body.message).toBe('Only 1 available');
      expect(r.body.deviceLines[0].quantity).toBe(1);
      const r2 = await guest({ lines: [line('p-foxtrot-v0', 9)], coupon: null, op: { type: 'add', variantId: 'p-foxtrot-v0', quantity: 3 } });
      expect(r2.body.message).toBe('Only 9 available');
      const r3 = await guest({ lines: [], coupon: null, op: { type: 'add', variantId: 'p-hotel-v0' } });
      expect(r3.body).toMatchObject({ code: 'PRODUCT_INACTIVE', message: 'This product is no longer available.' });
      const r4 = await guest({ lines: [], coupon: null, op: { type: 'add', variantId: 'p-echo-v0' } });
      expect(r4.body).toMatchObject({ code: 'OUT_OF_STOCK' });
    });

    it('flags inactive, out-of-stock and over-stock lines and blocks checkout (BAG-005, EC-01)', async () => {
      const r = await guest({ lines: [line('p-hotel-v0'), line('p-echo-v0'), line('p-charlie-v0', 3), line('p-delta-v0')], coupon: null });
      const flags = Object.fromEntries(r.body.lines.map((l: { variantId: string; flagMessage: string | null }) => [l.variantId, l.flagMessage]));
      expect(flags).toEqual({ 'p-hotel-v0': 'No longer available', 'p-echo-v0': 'Out of stock', 'p-charlie-v0': 'Only 1 left', 'p-delta-v0': null });
      expect(r.body.blocked).toBe(true);
      // Only priceable units count towards amounts: charlie at 1 + delta.
      expect(r.body.quote.bagValue.display).toBe('₹3,599');
    });

    it('reports a price change since the guest last saw the line (BAG-004)', async () => {
      const r = await guest({ lines: [line('p-delta-v0', 1, { lastSeenUnitPrice: 249900 })], coupon: null });
      expect(r.body.lines[0].priceChange.message).toBe('Price changed from ₹2,499 to ₹2,099');
      expect(r.body.deviceLines[0].lastSeenUnitPrice).toBe(209900);
    });

    it('coupons: invalid, expired, below minimum, not applicable, applied, and auto-removed (BAG-006, BAG-007)', async () => {
      const lines = [line('p-delta-v0')];
      expect((await guest({ lines, coupon: null, op: { type: 'applyCoupon', code: 'NOPE99' } })).body).toMatchObject({ code: 'COUPON_INVALID', message: "This coupon code isn't valid." });
      expect((await guest({ lines, coupon: null, op: { type: 'applyCoupon', code: 'expired50' } })).body).toMatchObject({ code: 'COUPON_EXPIRED' });
      expect((await guest({ lines: [line('p-foxtrot-v0')], coupon: null, op: { type: 'applyCoupon', code: 'WELCOME10' } })).body)
        .toMatchObject({ code: 'COUPON_NOT_ELIGIBLE', message: 'Add items worth ₹500 more to use this coupon' });
      expect((await guest({ lines, coupon: null, op: { type: 'applyCoupon', code: 'BEAUTY15' } })).body)
        .toMatchObject({ code: 'COUPON_NOT_ELIGIBLE', message: "This coupon doesn't apply to items in your bag" });
      const ok = await guest({ lines, coupon: null, op: { type: 'applyCoupon', code: 'welcome10' } });
      expect(ok.body.couponCode).toBe('WELCOME10');
      expect(ok.body.quote.coupon).toEqual({ code: 'WELCOME10', discount: { paise: 21000, display: '₹210' } });
      expect(ok.body.coupons.find((c: { code: string }) => c.code === 'WELCOME10')).toMatchObject({ eligible: true, saving: { display: '₹210' } });
      // Lowering the bag below the minimum removes it with a reason.
      const after = await guest({ lines: [line('p-foxtrot-v0')], coupon: 'WELCOME10' });
      expect(after.body.couponCode).toBeNull();
      expect(after.body.couponRemoved.message).toBe('Coupon WELCOME10 removed: Add items worth ₹500 more to use this coupon');
    });

    it('bank-offer preview on eligible lines (BAG-008)', async () => {
      const r = await guest({ lines: [line('p-delta-v0', 2)], coupon: null });
      expect(r.body.quote.bankOffer).toEqual({ state: 'available', text: 'Pay with an HDFC card and save up to ₹420' });
      const low = await guest({ lines: [line('p-delta-v0', 1)], coupon: null });
      expect(low.body.quote.bankOffer.text).toBe('10% instant discount with HDFC cards on eligible items above ₹2,500');
    });
  });

  describe('customer bag (stored)', () => {
    it('add, change quantity (capped to available), remove, survives reload (BAG-001…003, AUTH-014)', async () => {
      const a = await customer();
      let r = await send(a, 'post', '/bag/lines', { variantId: 'p-alpha-v1' });
      expect(r.body).toMatchObject({ units: 1, lines: [{ variantId: 'p-alpha-v1', quantity: 1, maxQuantity: 4, size: 'M' }] });
      r = await send(a, 'patch', '/bag/lines/p-alpha-v1', { quantity: 7 });
      expect(r.body.message).toBe('Only 4 available');
      expect(r.body.lines[0].quantity).toBe(4);
      expect((await send(a, 'patch', '/bag/lines/p-alpha-v1', { quantity: 11 })).status).toBe(422);
      expect((await a.get('/api/v1/bag')).body.units).toBe(4);
      r = await send(a, 'delete', '/bag/lines/p-alpha-v1');
      expect(r.body.lines).toEqual([]);
    });

    it('enforces the line limit (SD-12) with the LIMIT_REACHED message', async () => {
      const a = await customer();
      const ids = ['p-delta-v0', 'p-golf-v0', 'p-bravo-v0'];
      await t.ctx.db.setting.upsert({ where: { key: 'bag.limits' }, create: { key: 'bag.limits', value: { maxQtyPerLine: 10, maxLines: 2 } }, update: { value: { maxQtyPerLine: 10, maxLines: 2 } } });
      await t.ctx.settings.refresh();
      try {
        await send(a, 'post', '/bag/lines', { variantId: ids[0] });
        await send(a, 'post', '/bag/lines', { variantId: ids[1] });
        const r = await send(a, 'post', '/bag/lines', { variantId: ids[2] });
        expect(r.body).toMatchObject({ code: 'LIMIT_REACHED', message: 'Your bag can hold up to 50 different items.' });
      } finally {
        await t.ctx.db.setting.delete({ where: { key: 'bag.limits' } });
        await t.ctx.settings.refresh();
      }
    });

    it('reports a price change once, then remembers the new price (BAG-004)', async () => {
      const a = await customer();
      await send(a, 'post', '/bag/lines', { variantId: 'p-bravo-v0' });
      await t.ctx.db.variant.update({ where: { id: 'p-bravo-v0' }, data: { sellingPrice: 199900 } });
      try {
        const first = await a.get('/api/v1/bag');
        expect(first.body.lines[0].priceChange.message).toBe('Price changed from ₹2,499 to ₹1,999');
        expect((await a.get('/api/v1/bag')).body.lines[0].priceChange).toBeNull();
      } finally {
        await t.ctx.db.variant.update({ where: { id: 'p-bravo-v0' }, data: { sellingPrice: 249900 } });
      }
    });

    it('coupon apply and remove; move to wishlist', async () => {
      const a = await customer();
      await send(a, 'post', '/bag/lines', { variantId: 'p-delta-v0' });
      const c = await send(a, 'post', '/bag/coupon', { code: 'flat200' });
      expect(c.body.quote.coupon.discount.display).toBe('₹200');
      expect((await send(a, 'delete', '/bag/coupon')).body.quote.coupon).toBeNull();
      const m = await send(a, 'post', '/bag/lines/p-delta-v0/move-to-wishlist');
      expect(m.body.lines).toEqual([]);
      expect((await a.get('/api/v1/wishlist/ids')).body.productIds).toEqual(['p-delta']);
    });

    it('requires a session', async () => {
      expect((await request(t.app).get('/api/v1/bag')).body.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('wishlist (WSH-001…004)', () => {
    it('lists cards with status; move to bag needs a size when several are available', async () => {
      const a = await customer();
      for (const id of ['p-alpha', 'p-echo', 'p-foxtrot']) await send(a, 'post', '/wishlist', { productId: id });
      const list = await a.get('/api/v1/wishlist');
      const status = Object.fromEntries(list.body.items.map((i: { card: { id: string }; status: string }) => [i.card.id, i.status]));
      expect(status).toMatchObject({ 'p-alpha': 'ok', 'p-echo': 'out_of_stock', 'p-foxtrot': 'ok' });
      const needSize = await send(a, 'post', '/wishlist/p-alpha/move-to-bag', {});
      expect(needSize.body.fieldErrors[0].message).toBe('Please select a size');
      const moved = await send(a, 'post', '/wishlist/p-alpha/move-to-bag', { variantId: 'p-alpha-v2' });
      expect(moved.body.lines[0].variantId).toBe('p-alpha-v2');
      const one = await send(a, 'post', '/wishlist/p-foxtrot/move-to-bag', {});
      expect(one.body.units).toBe(2);
      expect((await a.get('/api/v1/wishlist/ids')).body.productIds).toEqual(['p-echo']);
    });

    it('guest view returns cards for device ids; inactive products show as unavailable', async () => {
      const r = await send(request.agent(t.app), 'post', '/wishlist/guest-view', { productIds: ['p-hotel', 'p-golf', 'nope'] });
      expect(r.body.items.map((i: { card: { id: string }; status: string }) => [i.card.id, i.status])).toEqual([['p-hotel', 'unavailable'], ['p-golf', 'ok']]);
    });
  });

  describe('merge on login and sign-up (AUTH-012, EC-15)', () => {
    it('sums quantities with caps and messages, unions the wishlist, keeps the account coupon, adds flagged lines', async () => {
      const email = `merge${n++}@example.com`;
      const a = request.agent(t.app);
      await send(a, 'post', '/auth/signup', { name: 'Merge Me', email, password: 'secret123', confirmPassword: 'secret123', securityQuestionId: 'q1', securityAnswer: 'blue', ageConfirmed: true });
      await send(a, 'post', '/bag/lines', { variantId: 'p-alpha-v1', quantity: 3 });
      await send(a, 'post', '/bag/coupon', { code: 'WELCOME10' });
      await send(a, 'post', '/wishlist', { productId: 'p-golf' });
      await send(a, 'post', '/auth/logout');

      const b = request.agent(t.app);
      const login = await send(b, 'post', '/auth/login', {
        identifier: email, password: 'secret123',
        guest: { bag: [line('p-alpha-v1', 3), line('p-hotel-v0', 1), line('p-foxtrot-v0', 2)], wishlist: ['p-golf', 'p-delta'], coupon: 'FLAT200', recentSearches: [] },
      });
      expect(login.status).toBe(200);
      expect(login.body.messages).toEqual(['Northlane Alpha Crew Tee (M): quantity adjusted to 4']);
      const bag = await b.get('/api/v1/bag');
      expect(Object.fromEntries(bag.body.lines.map((l: { variantId: string; quantity: number }) => [l.variantId, l.quantity]))).toEqual({ 'p-alpha-v1': 4, 'p-hotel-v0': 1, 'p-foxtrot-v0': 2 });
      expect(bag.body.lines.find((l: { variantId: string }) => l.variantId === 'p-hotel-v0').flag).toBe('inactive');
      expect(bag.body.couponCode).toBe('WELCOME10');
      expect((await b.get('/api/v1/wishlist/ids')).body.productIds.sort()).toEqual(['p-delta', 'p-golf']);
    });

    it('applies the guest coupon when the account bag has none (sign-up)', async () => {
      const a = await customer({ bag: [line('p-delta-v0')], wishlist: [], coupon: 'FLAT200', recentSearches: [] });
      expect((await a.get('/api/v1/bag')).body.couponCode).toBe('FLAT200');
    });

    it('skips guest lines over the line limit with a message (EC-15)', async () => {
      await t.ctx.db.setting.upsert({ where: { key: 'bag.limits' }, create: { key: 'bag.limits', value: { maxQtyPerLine: 10, maxLines: 1 } }, update: { value: { maxQtyPerLine: 10, maxLines: 1 } } });
      await t.ctx.settings.refresh();
      try {
        const a = request.agent(t.app);
        const r = await send(a, 'post', '/auth/signup', {
          name: 'Limit Case', email: `lim${n++}@example.com`, password: 'secret123', confirmPassword: 'secret123', securityQuestionId: 'q1', securityAnswer: 'blue', ageConfirmed: true,
          guest: { bag: [line('p-delta-v0'), line('p-golf-v0')], wishlist: [], coupon: null, recentSearches: [] },
        });
        expect(r.body.messages).toEqual(["1 item from your guest bag couldn't be added: your bag can hold up to 1 different items."]);
      } finally {
        await t.ctx.db.setting.delete({ where: { key: 'bag.limits' } });
        await t.ctx.settings.refresh();
      }
    });
  });
});
