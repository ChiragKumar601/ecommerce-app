import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { syncConfig } from '../src/seed/seedDb.js';
import { createTestApp, TEST_ORIGIN } from './helpers/testApp.js';

type Agent = ReturnType<typeof request.agent>;

describe('addresses (S13)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let n = 0;
  const send = (a: Agent, method: 'post' | 'patch' | 'delete', path: string, body?: unknown) => a[method](`/api/v1${path}`).set('Origin', TEST_ORIGIN).send(body as object);
  async function customer(): Promise<Agent> {
    const a = request.agent(t.app);
    await send(a, 'post', '/auth/signup', { name: 'Anil Rao', email: `addr${n++}@example.com`, password: 'secret123', confirmPassword: 'secret123', securityQuestionId: 'q1', securityAnswer: 'blue', ageConfirmed: true });
    return a;
  }
  const addr = (over: Record<string, unknown> = {}) => ({
    recipientName: 'Anil Rao', recipientPhone: '9876543210', houseFlat: 'Flat 4B', building: 'Lotus Towers', streetArea: 'Connaught Place',
    landmark: '', city: 'New Delhi', state: 'Delhi', pincode: '110001', labelType: 'Home', labelText: '', latitude: 28.63, longitude: 77.21, ...over,
  });

  beforeAll(async () => {
    t = await createTestApp({ seed: (ctx) => syncConfig(ctx.db).then(() => undefined) });
  }, 60_000);
  afterAll(async () => t.cleanup());
  beforeEach(() => t.clock.advance(61_000));

  it('first address becomes the default; serviceable with a delivery date (ADDR-004, ADDR-006, CHK-004)', async () => {
    const a = await customer();
    const r = await send(a, 'post', '/me/addresses', addr());
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ isDefault: true, serviceable: true, label: 'Home', recipientPhone: '+919876543210' });
    expect(r.body.delivery.message).toMatch(/^Delivery by \w{3}, \d{1,2} \w{3} 2026$/);
  });

  it('saves an unserviceable address flagged, and manual addresses without coordinates (ADDR-003, ADDR-004, UF-14)', async () => {
    const a = await customer();
    const r = await send(a, 'post', '/me/addresses', addr({ pincode: '999999', latitude: null, longitude: null, labelType: 'Other', labelText: 'Parents' }));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ serviceable: false, delivery: { message: "We don't deliver to 999999 yet" }, latitude: null, label: 'Parents' });
  });

  it('validates fields per §12, including the state list and the Other label', async () => {
    const a = await customer();
    const r = await send(a, 'post', '/me/addresses', addr({ houseFlat: '', pincode: '012345', state: 'Narnia', labelType: 'Other', labelText: '' }));
    const fields = Object.fromEntries(r.body.fieldErrors.map((f: { field: string; message: string }) => [f.field, f.message]));
    expect(fields).toMatchObject({ houseFlat: 'This field is required', pincode: 'Enter a valid 6-digit pincode', labelText: 'Enter a label' });
    const badState = await send(a, 'post', '/me/addresses', addr({ state: 'Narnia' }));
    expect(badState.body.fieldErrors[0]).toMatchObject({ field: 'state', message: 'Select a state' });
  });

  it('limits to 10 addresses (ADDR-009)', async () => {
    const a = await customer();
    for (let i = 0; i < 10; i++) expect((await send(a, 'post', '/me/addresses', addr({ houseFlat: `Flat ${i}` }))).status).toBe(201);
    const over = await send(a, 'post', '/me/addresses', addr());
    expect(over.body).toMatchObject({ code: 'LIMIT_REACHED', message: 'You can save up to 10 addresses. Delete one to add another.' });
    expect((await a.get('/api/v1/me/addresses')).body.atLimit).toBe(true);
  });

  it('edit, set default, and deleting the default promotes the most recent (ADDR-005, EC-13)', async () => {
    const a = await customer();
    const first = (await send(a, 'post', '/me/addresses', addr({ houseFlat: 'First' }))).body;
    t.clock.advance(1000);
    const second = (await send(a, 'post', '/me/addresses', addr({ houseFlat: 'Second' }))).body;
    t.clock.advance(1000);
    const third = (await send(a, 'post', '/me/addresses', addr({ houseFlat: 'Third' }))).body;
    const edited = await send(a, 'patch', `/me/addresses/${second.id}`, addr({ houseFlat: 'Second (edited)', pincode: '110002' }));
    expect(edited.body).toMatchObject({ houseFlat: 'Second (edited)', pincode: '110002', isDefault: false });
    const set = await send(a, 'post', `/me/addresses/${second.id}/default`);
    expect(set.body.items[0]).toMatchObject({ id: second.id, isDefault: true });
    const after = await send(a, 'delete', `/me/addresses/${second.id}`);
    expect(after.body.items.find((x: { isDefault: boolean }) => x.isDefault).id).toBe(third.id);
    expect(after.body.items.map((x: { id: string }) => x.id)).toContain(first.id);
  });

  it("another account's address is NOT_FOUND (AUTHZ-002)", async () => {
    const owner = await customer();
    const id = (await send(owner, 'post', '/me/addresses', addr())).body.id as string;
    const other = await customer();
    for (const r of [
      await send(other, 'patch', `/me/addresses/${id}`, addr()),
      await send(other, 'delete', `/me/addresses/${id}`),
      await send(other, 'post', `/me/addresses/${id}/default`),
    ]) expect(r.body).toEqual({ code: 'NOT_FOUND', message: "We couldn't find that." });
  });

  it('lists states and union territories', async () => {
    const r = await request(t.app).get('/api/v1/states');
    expect(r.body).toHaveLength(36);
  });
});
