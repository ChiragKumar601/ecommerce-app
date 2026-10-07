import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { listingFixture, seedCatalogueFixture } from './helpers/catalogueFixture.js';
import { createTestApp, TEST_ORIGIN } from './helpers/testApp.js';

type Agent = ReturnType<typeof request.agent>;

describe('checkout (S14)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let n = 0;
  const send = (a: Agent, method: 'post' | 'put' | 'patch' | 'delete', path: string, body?: unknown) => a[method](`/api/v1${path}`).set('Origin', TEST_ORIGIN).send(body as object);
  async function customer(over: Record<string, unknown> = {}): Promise<Agent> {
    const a = request.agent(t.app);
    const r = await send(a, 'post', '/auth/signup', { name: 'Meera Iyer', email: `co${n++}@example.com`, password: 'secret123', confirmPassword: 'secret123', securityQuestionId: 'q1', securityAnswer: 'blue', ageConfirmed: true, ...over });
    expect(r.status).toBe(201);
    return a;
  }
  const address = (a: Agent, pincode = '110001') => send(a, 'post', '/me/addresses', {
    recipientName: 'Meera Iyer', recipientPhone: '9876543210', houseFlat: '12', streetArea: 'Janpath', city: 'New Delhi', state: 'Delhi', pincode, labelType: 'Home',
  });

  beforeAll(async () => {
    t = await createTestApp({ seed: (ctx) => seedCatalogueFixture(ctx.db, listingFixture()) });
  }, 120_000);
  afterAll(async () => t.cleanup());
  beforeEach(() => t.clock.advance(61_000));

  it('starts from the bag with the default serviceable address, a stored quote and the phone step (CHK-001, CHK-003, CHK-004, API-006)', async () => {
    const a = await customer();
    await address(a);
    await send(a, 'post', '/bag/lines', { variantId: 'p-delta-v0' });
    const r = await send(a, 'post', '/checkout', { source: 'bag' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ source: 'bag', step: 'address', changes: [], phone: { needed: true }, address: { serviceable: true }, units: 1 });
    expect(r.body.quote.total.display).toBe('₹2,099');
    expect(await t.ctx.db.quote.findUnique({ where: { id: r.body.quoteId } })).not.toBeNull();
    // Can't move on without a phone (CHK-003).
    expect((await send(a, 'put', `/checkout/${r.body.id}/step`, { step: 'summary' })).body.fieldErrors[0].field).toBe('phone');
  });

  it('EC-02: a price drop since the bag is listed with before and after values', async () => {
    const a = await customer({ phone: '9000000101' });
    await send(a, 'post', '/bag/lines', { variantId: 'p-bravo-v0' });
    await t.ctx.db.variant.update({ where: { id: 'p-bravo-v0' }, data: { sellingPrice: 199900 } });
    try {
      const r = await send(a, 'post', '/checkout', { source: 'bag' });
      const types = r.body.changes.map((c: { type: string }) => c.type);
      expect(types).toEqual(expect.arrayContaining(['PRICE_CHANGED', 'TOTAL_CHANGED']));
      expect(r.body.changes.find((c: { type: string }) => c.type === 'PRICE_CHANGED')).toMatchObject({ from: { display: '₹2,499' }, to: { display: '₹1,999' } });
      const ack = await send(a, 'post', `/checkout/${r.body.id}/acknowledge`);
      expect(ack.body.changes).toEqual([]);
      // ₹1,999 is not above the free-delivery threshold, so delivery now applies (PRC-005).
      expect(types).toContain('DELIVERY_CHANGED');
      expect(ack.body.quote.total.display).toBe('₹2,098');
    } finally {
      await t.ctx.db.variant.update({ where: { id: 'p-bravo-v0' }, data: { sellingPrice: 249900 } });
    }
  });

  it('EC-03: a coupon that expired since the bag is removed at re-validation, with a reason', async () => {
    const a = await customer({ phone: '9000000102' });
    await send(a, 'post', '/bag/lines', { variantId: 'p-delta-v0' });
    await send(a, 'post', '/bag/coupon', { code: 'WELCOME10' });
    await t.ctx.db.coupon.update({ where: { code: 'WELCOME10' }, data: { validTo: new Date(t.clock.now().getTime() - 1000) } });
    try {
      const r = await send(a, 'post', '/checkout', { source: 'bag' });
      expect(r.body.changes).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'COUPON_REMOVED', code: 'WELCOME10', reason: 'expired' })]));
      expect(r.body.couponCode).toBeNull();
      expect(r.body.quote.total.display).toBe('₹2,099');
    } finally {
      await t.ctx.db.coupon.update({ where: { code: 'WELCOME10' }, data: { validTo: new Date('2027-12-31T18:29:59Z') } });
    }
  });

  it('blocks a bag with flagged lines, or an empty bag (BAG-005, CHECKOUT_BLOCKED)', async () => {
    const a = await customer();
    expect((await send(a, 'post', '/checkout', { source: 'bag' })).body.code).toBe('CHECKOUT_BLOCKED');
    await t.ctx.db.bagLine.create({ data: { accountId: (await t.ctx.db.account.findFirstOrThrow({ orderBy: { createdAt: 'desc' } })).id, variantId: 'p-echo-v0', quantity: 1, addedAt: t.clock.now(), lastSeenUnitPrice: 89900 } });
    const r = await send(a, 'post', '/checkout', { source: 'bag' });
    expect(r.body).toMatchObject({ code: 'CHECKOUT_BLOCKED', message: 'Fix the highlighted items in your bag to continue.' });
  });

  it('Buy Now uses only that item, ignores the bag coupon, and allows changing the quantity within stock (CHK-006, EC-21)', async () => {
    const a = await customer();
    await send(a, 'post', '/bag/lines', { variantId: 'p-delta-v0' });
    await send(a, 'post', '/bag/coupon', { code: 'FLAT200' });
    const r = await send(a, 'post', '/checkout', { source: 'buy_now', variantId: 'p-alpha-v1' });
    expect(r.body).toMatchObject({ source: 'buy_now', couponCode: null, units: 1, items: [{ variantId: 'p-alpha-v1', quantity: 1, maxQuantity: 4 }] });
    expect((await send(a, 'put', `/checkout/${r.body.id}/items`, { quantity: 3 })).body.units).toBe(3);
    expect((await send(a, 'put', `/checkout/${r.body.id}/items`, { quantity: 5 })).body).toMatchObject({ code: 'OUT_OF_STOCK', message: 'Only 4 left.' });
    const withCoupon = await send(a, 'put', `/checkout/${r.body.id}/coupon`, { code: 'welcome10' });
    expect(withCoupon.body.quote.coupon.code).toBe('WELCOME10');
    // The bag is untouched by Buy Now.
    expect((await a.get('/api/v1/bag')).body).toMatchObject({ units: 1, couponCode: 'FLAT200' });
    expect((await send(a, 'post', '/checkout', { source: 'buy_now', variantId: 'p-echo-v0' })).body.code).toBe('OUT_OF_STOCK');
    expect((await send(a, 'post', '/checkout', { source: 'buy_now', variantId: 'p-hotel-v0' })).body.code).toBe('PRODUCT_INACTIVE');
  });

  it('EC-14: a phone that belongs to another account is used for this order only', async () => {
    await customer({ phone: '9000000200' });
    const a = await customer();
    await send(a, 'post', '/bag/lines', { variantId: 'p-delta-v0' });
    const c = (await send(a, 'post', '/checkout', { source: 'bag' })).body;
    const taken = await send(a, 'post', `/checkout/${c.id}/phone`, { phone: '9000000200' });
    expect(taken.body).toMatchObject({ savedToAccount: false, message: "This number can't be added to your account. We'll use it as the contact number for this order only.", phone: { value: '+919000000200', needed: false, forThisOrderOnly: true } });
    const free = await send(a, 'post', `/checkout/${c.id}/phone`, { phone: '9000000201' });
    expect(free.body).toMatchObject({ savedToAccount: true, phone: { value: '+919000000201' } });
    expect((await a.get('/api/v1/me')).body.phone).toBe('+919000000201');
  });

  it('only serviceable own addresses can be selected; the step moves on and is kept (CHK-004, CHK-007)', async () => {
    const a = await customer({ phone: '9000000103' });
    const bad = (await address(a, '999999')).body;
    const good = (await address(a, '110002')).body;
    await send(a, 'post', '/bag/lines', { variantId: 'p-delta-v0' });
    const c = (await send(a, 'post', '/checkout', { source: 'bag' })).body;
    expect(c.address.id).toBe(good.id);
    expect((await send(a, 'put', `/checkout/${c.id}/address`, { addressId: bad.id })).body).toMatchObject({ code: 'ADDRESS_NOT_SERVICEABLE', message: "We don't deliver to 999999 yet." });
    expect((await send(a, 'put', `/checkout/${c.id}/step`, { step: 'summary' })).body.step).toBe('summary');
    expect((await a.get(`/api/v1/checkout/${c.id}`)).body.step).toBe('summary');
    const other = await customer();
    expect((await other.get(`/api/v1/checkout/${c.id}`)).body.code).toBe('NOT_FOUND');
    expect((await send(other, 'put', `/checkout/${c.id}/address`, { addressId: good.id })).body.code).toBe('NOT_FOUND');
  });

  it('coupon at checkout uses the bag rules and keeps the bag coupon in step (CHK-005)', async () => {
    const a = await customer();
    await send(a, 'post', '/bag/lines', { variantId: 'p-foxtrot-v0' });
    const c = (await send(a, 'post', '/checkout', { source: 'bag' })).body;
    expect((await send(a, 'put', `/checkout/${c.id}/coupon`, { code: 'WELCOME10' })).body).toMatchObject({ code: 'COUPON_NOT_ELIGIBLE', message: 'Add items worth ₹500 more to use this coupon' });
    await send(a, 'patch', '/bag/lines/p-foxtrot-v0', { quantity: 3 });
    const c2 = (await send(a, 'post', '/checkout', { source: 'bag' })).body;
    const ok = await send(a, 'put', `/checkout/${c2.id}/coupon`, { code: 'WELCOME10' });
    expect(ok.body.quote.coupon).toMatchObject({ code: 'WELCOME10' });
    expect((await a.get('/api/v1/bag')).body.couponCode).toBe('WELCOME10');
    expect((await send(a, 'put', `/checkout/${c2.id}/coupon`, { code: null })).body.couponCode).toBeNull();
  });
});
