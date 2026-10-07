import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { syncConfig } from '../src/seed/seedDb.js';
import { createTestApp, TEST_ORIGIN } from './helpers/testApp.js';

type Agent = ReturnType<typeof request.agent>;

describe('profile, wallet, cards, support, demo help (S12)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let n = 0;
  const send = (a: Agent, method: 'post' | 'patch' | 'delete', path: string, body?: unknown, headers: Record<string, string> = {}) =>
    a[method](`/api/v1${path}`).set('Origin', TEST_ORIGIN).set(headers).send(body as object);
  async function customer(over: Record<string, unknown> = {}): Promise<{ a: Agent; email: string }> {
    const a = request.agent(t.app);
    const email = `acct${n++}@example.com`;
    const r = await send(a, 'post', '/auth/signup', { name: 'Priya Shah', email, password: 'secret123', confirmPassword: 'secret123', securityQuestionId: 'q1', securityAnswer: 'blue', ageConfirmed: true, ...over });
    expect(r.status).toBe(201);
    return { a, email };
  }
  const HDFC_CREDIT = '4000000110000009';

  beforeAll(async () => {
    t = await createTestApp({ seed: (ctx) => syncConfig(ctx.db).then(() => undefined) });
  }, 60_000);
  afterAll(async () => t.cleanup());
  beforeEach(() => t.clock.advance(61_000));

  describe('profile (PRF-002)', () => {
    it('updates name, gender and date of birth without the password', async () => {
      const { a, email } = await customer();
      const r = await send(a, 'patch', '/me', { name: 'Priya S', email, gender: 'female', dateOfBirth: '1990-05-01' });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ name: 'Priya S', gender: 'female', dateOfBirth: '1990-05-01', securityQuestion: { id: 'q1' } });
      const young = await send(a, 'patch', '/me', { name: 'Priya S', email, dateOfBirth: '2015-01-01' });
      expect(young.body.fieldErrors[0]).toMatchObject({ field: 'dateOfBirth', message: 'You must be 18 or older' });
    });

    it('needs the current password for email, phone, password and question changes', async () => {
      const { a, email } = await customer();
      const noPw = await send(a, 'patch', '/me', { name: 'Priya Shah', email, phone: '9811122233' });
      expect(noPw.body.fieldErrors[0].field).toBe('currentPassword');
      const wrong = await send(a, 'patch', '/me', { name: 'Priya Shah', email, phone: '9811122233', currentPassword: 'nope1234' });
      expect(wrong.body).toMatchObject({ code: 'INVALID_CURRENT_PASSWORD', message: 'Your current password is incorrect.' });
      const ok = await send(a, 'patch', '/me', { name: 'Priya Shah', email, phone: '9811122233', currentPassword: 'secret123', newPassword: 'newpass99', confirmNewPassword: 'newpass99' });
      expect(ok.body.phone).toBe('+919811122233');
      expect((await send(request.agent(t.app), 'post', '/auth/login', { identifier: '9811122233', password: 'newpass99' })).status).toBe(200);
    });

    it('keeps at least one identifier and rejects one linked to another account', async () => {
      const other = await customer();
      const { a, email } = await customer();
      const none = await send(a, 'patch', '/me', { name: 'Priya Shah', email: '', phone: '' });
      expect(none.body.fieldErrors[0]).toMatchObject({ field: 'email', message: 'Keep an email address or a mobile number' });
      const dup = await send(a, 'patch', '/me', { name: 'Priya Shah', email: other.email, currentPassword: 'secret123' });
      expect(dup.body).toMatchObject({ code: 'IDENTIFIER_TAKEN', message: 'This email/phone is already linked to another account.' });
      expect(email).toBeTruthy();
    });
  });

  describe('credits and gift cards (PRF-003, PRF-004)', () => {
    it('shows the ₹500 sign-up credit in the ledger', async () => {
      const { a } = await customer();
      const r = await a.get('/api/v1/me/credits');
      expect(r.body.balance.display).toBe('₹500');
      expect(r.body.entries[0]).toMatchObject({ description: 'Welcome credits', amount: { display: '₹500' } });
    });

    it('redeems a code case-insensitively; repeated, unknown and inactive codes fail; same idempotency key replays', async () => {
      const { a } = await customer();
      const r = await send(a, 'post', '/me/gift-cards/redeem', { code: 'demogift1000' }, { 'Idempotency-Key': 'redeem-key-1' });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ maskedCode: '•••• 1000', balance: { display: '₹1,000' }, status: 'active' });
      const replay = await send(a, 'post', '/me/gift-cards/redeem', { code: 'demogift1000' }, { 'Idempotency-Key': 'redeem-key-1' });
      expect(replay.status).toBe(201);
      expect(replay.headers['idempotent-replay']).toBe('true');
      expect((await send(a, 'post', '/me/gift-cards/redeem', { code: 'DEMOGIFT1000' })).body).toMatchObject({ code: 'GIFT_CARD_ALREADY_REDEEMED', message: "You've already redeemed this gift card" });
      expect((await send(a, 'post', '/me/gift-cards/redeem', { code: 'NOTACODE99' })).body.message).toBe('Invalid gift card code');
      expect((await send(a, 'post', '/me/gift-cards/redeem', { code: 'DEMOINACTIVE' })).body.message).toBe('This gift card is no longer valid');
    });

    it('expires short-validity cards (§7.6)', async () => {
      const { a } = await customer();
      await send(a, 'post', '/me/gift-cards/redeem', { code: 'DEMOSHORT250' });
      // A day later (moved in the data, so the session's idle timeout doesn't interfere).
      await t.ctx.db.accountGiftCard.updateMany({ where: { code: 'DEMOSHORT250' }, data: { expiresAt: new Date(t.clock.now().getTime() - 1) } });
      const list = await a.get('/api/v1/me/gift-cards');
      expect(list.body.items[0]).toMatchObject({ status: 'expired', usable: false });
    });
  });

  describe('saved cards (PRF-005, SEC-003)', () => {
    it('only test cards; never stores the number or CVV; default rules; limit of 5', async () => {
      const { a } = await customer();
      const real = await send(a, 'post', '/me/cards', { nameOnCard: 'Priya Shah', number: '4111 1111 1111 1111', expiry: '12/30', cvv: '123' });
      expect(real.body).toMatchObject({ code: 'NOT_TEST_CARD', message: "Use a demo test card. Real cards aren't accepted. See Demo help." });
      const bad = await send(a, 'post', '/me/cards', { nameOnCard: 'Priya Shah', number: HDFC_CREDIT, expiry: '01/20', cvv: '12' });
      expect(bad.body.fieldErrors.map((f: { field: string }) => f.field).sort()).toEqual(['cvv', 'expiry']);
      const first = await send(a, 'post', '/me/cards', { nameOnCard: 'Priya Shah', number: HDFC_CREDIT, expiry: '12/30', cvv: '123' });
      expect(first.body.items[0]).toMatchObject({ label: 'Visa •••• 0009', issuingBank: 'HDFC Bank', isDefault: true, expiry: '12/30' });
      const rows = await t.ctx.db.savedCard.findMany();
      expect(JSON.stringify(rows)).not.toContain(HDFC_CREDIT);
      expect(JSON.stringify(rows)).not.toMatch(/"cvv"/);

      const others = (await t.ctx.db.testCard.findMany({ orderBy: { number: 'asc' } })).filter((c) => c.number !== HDFC_CREDIT);
      const cvv = (c: { network: string }) => (c.network === 'Amex' ? '1234' : '123');
      for (const c of others.slice(0, 4)) expect((await send(a, 'post', '/me/cards', { nameOnCard: 'Priya Shah', number: c.number, expiry: '12/30', cvv: cvv(c) })).status).toBe(201);
      const six = others[4]!;
      const over = await send(a, 'post', '/me/cards', { nameOnCard: 'Priya Shah', number: six.number, expiry: '11/30', cvv: cvv(six) });
      expect(over.body).toMatchObject({ code: 'LIMIT_REACHED', message: 'You can save up to 5 cards. Remove one to add another.' });

      const list = (await a.get('/api/v1/me/cards')).body.items as { id: string; isDefault: boolean }[];
      const def = list.find((c) => c.isDefault)!;
      const after = await send(a, 'delete', `/me/cards/${def.id}`);
      expect(after.body.items).toHaveLength(4);
      expect(after.body.items.filter((c: { isDefault: boolean }) => c.isDefault)).toHaveLength(1);
      const target = after.body.items[3].id as string;
      const set = await send(a, 'post', `/me/cards/${target}/default`);
      expect(set.body.items[0]).toMatchObject({ id: target, isDefault: true });
    });
  });

  describe('support (PRF-006, PRV-002)', () => {
    it('creates numbered requests, lists them, and records deletion requests', async () => {
      const { a } = await customer();
      const short = await send(a, 'post', '/me/support-requests', { type: 'payment', message: 'short' });
      expect(short.body.fieldErrors[0].message).toBe('Describe your issue (10–1,000 characters)');
      const r = await send(a, 'post', '/me/support-requests', { type: 'payment', message: 'My payment shows as pending.' });
      expect(r.body.message).toMatch(/^Request SR-\d{6}-[A-Z0-9]{5} submitted$/);
      const del = await send(a, 'post', '/me/support-requests', { type: 'account_deletion', message: 'Please delete my account.' });
      expect(del.body.message).toBe("We've recorded your request. Your account and personal data will be deleted within 30 days.");
      const list = await a.get('/api/v1/me/support-requests');
      expect(list.body.items).toHaveLength(2);
      expect(list.body.items[0]).toMatchObject({ status: 'Submitted', typeLabel: 'Delete my account' });
      const orderRef = await send(a, 'post', '/me/support-requests', { type: 'order_issue', orderId: 'someone-elses-order', message: 'Where is my order?' });
      expect(orderRef.body.code).toBe('NOT_FOUND');
    });
  });

  describe('ownership (AUTHZ-001/002)', () => {
    it("another account's card id is NOT_FOUND, exactly like a missing one", async () => {
      const owner = await customer();
      await send(owner.a, 'post', '/me/cards', { nameOnCard: 'Priya Shah', number: HDFC_CREDIT, expiry: '12/30', cvv: '123' });
      const id = (await owner.a.get('/api/v1/me/cards')).body.items[0].id as string;
      const intruder = await customer();
      const theirs = await send(intruder.a, 'delete', `/me/cards/${id}`);
      const missing = await send(intruder.a, 'delete', '/me/cards/00000000-0000-4000-8000-000000000000');
      expect(theirs.status).toBe(404);
      expect(theirs.body).toEqual(missing.body);
      expect((await send(intruder.a, 'post', `/me/cards/${id}/default`)).status).toBe(404);
      expect((await request(t.app).get('/api/v1/me')).body.code).toBe('UNAUTHENTICATED');
    });
  });

  it('demo help lists test cards, UPI IDs, gift codes and return tags (DAT-006, DAT-007, RET-006)', async () => {
    const r = await request(t.app).get('/api/v1/demo-help');
    expect(r.body.cards).toHaveLength(15);
    expect(r.body.cards[0].number).toMatch(/^\d{4} \d{4} \d{4} \d{4}$/);
    expect(r.body.upi.map((u: { upiId: string }) => u.upiId)).toEqual(['cancel@demo', 'failure@demo', 'success@demo', 'timeout@demo']);
    expect(r.body.giftCards.map((g: { code: string }) => g.code)).not.toContain('DEMOINACTIVE');
    expect(r.body.returnTags.map((x: { tag: string }) => x.tag)).toEqual(['#approve', '#reject', '#pickupfail']);
  });
});
