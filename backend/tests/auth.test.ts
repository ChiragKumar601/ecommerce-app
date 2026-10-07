import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { syncConfig } from '../src/seed/seedDb.js';
import { createTestApp, TEST_ORIGIN } from './helpers/testApp.js';

describe('accounts and authentication (S10)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  const post = (agent: ReturnType<typeof request.agent> | ReturnType<typeof request>, path: string, body: unknown) =>
    (agent as ReturnType<typeof request.agent>).post(`/api/v1${path}`).set('Origin', TEST_ORIGIN).send(body as object);
  const valid = (over: Record<string, unknown> = {}) => ({
    name: 'Asha Kumar', email: 'asha@example.com', phone: '', password: 'secret123', confirmPassword: 'secret123',
    securityQuestionId: 'q1', securityAnswer: '  Blue   Moon ', ageConfirmed: true, ...over,
  });

  beforeAll(async () => {
    t = await createTestApp({ seed: (ctx) => syncConfig(ctx.db).then(() => undefined) });
  }, 60_000);
  afterAll(async () => t.cleanup());
  // Fresh rate-limit window for every test.
  beforeEach(() => t.clock.advance(61_000));

  describe('sign-up (AUTH-001…003)', () => {
    it('creates the account, grants ₹500 credits, logs in with a secure cookie', async () => {
      const agent = request.agent(t.app);
      const res = await post(agent, '/auth/signup', valid());
      expect(res.status).toBe(201);
      expect(res.body.account).toMatchObject({ name: 'Asha Kumar', email: 'asha@example.com', phone: null });
      const cookie = res.headers['set-cookie']![0]!;
      expect(cookie).toMatch(/^wco_sid=/);
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Lax/);
      const session = await agent.get('/api/v1/auth/session');
      expect(session.body).toMatchObject({ authenticated: true, account: { email: 'asha@example.com' } });
      const a = await t.ctx.db.account.findUniqueOrThrow({ where: { email: 'asha@example.com' }, include: { creditEntries: true } });
      expect(a.creditEntries).toEqual([expect.objectContaining({ amount: 50000, type: 'signup_grant' })]);
      // Secrets are stored only as Argon2id hashes (AUTH-007, SEC-002).
      expect(a.passwordHash).toMatch(/^\$argon2id\$/);
      expect(a.securityAnswerHash).toMatch(/^\$argon2id\$/);
      expect(JSON.stringify(res.body)).not.toMatch(/secret123|blue moon|argon/i);
    });

    it('normalises phone numbers and rejects duplicates with the field marked (AUTH-002)', async () => {
      const r1 = await post(request(t.app), '/auth/signup', valid({ email: '', phone: '09876543210' }));
      expect(r1.status).toBe(201);
      expect(r1.body.account.phone).toBe('+919876543210');
      const dup = await post(request(t.app), '/auth/signup', valid({ email: '', phone: '+91 9876543210'.replace(' ', '') }));
      expect(dup.status).toBe(409);
      expect(dup.body).toMatchObject({ code: 'IDENTIFIER_TAKEN', message: 'An account with this email/phone already exists.' });
      expect(dup.body.fieldErrors[0].field).toBe('phone');
      const dupEmail = await post(request(t.app), '/auth/signup', valid({ email: 'ASHA@example.com' }));
      expect(dupEmail.body.fieldErrors[0].field).toBe('email');
    });

    it('validates per §12', async () => {
      const cases: [Record<string, unknown>, string, string][] = [
        [{ email: '', phone: '' }, 'email', 'Enter an email address or a mobile number'],
        [{ confirmPassword: 'other123' }, 'confirmPassword', "Passwords don't match"],
        [{ ageConfirmed: false }, 'ageConfirmed', 'You must be 18 or older to create an account'],
        [{ password: 'lettersonly', confirmPassword: 'lettersonly' }, 'password', 'Use 8–64 characters with at least one letter and one number'],
        [{ name: 'A' }, 'name', 'Enter your name (2–60 letters)'],
        [{ securityAnswer: 'x' }, 'securityAnswer', 'Enter an answer (2–50 characters)'],
      ];
      for (const [over, field, message] of cases) {
        const r = await post(request(t.app), '/auth/signup', valid({ email: `v${field}@example.com`, ...over }));
        expect(r.status, field).toBe(422);
        expect(r.body.fieldErrors).toContainEqual(expect.objectContaining({ field, message }));
      }
      const badQ = await post(request(t.app), '/auth/signup', valid({ email: 'q@example.com', securityQuestionId: 'nope' }));
      expect(badQ.status).toBe(422);
    });
  });

  describe('login (AUTH-004…006, SEC-004)', () => {
    beforeAll(async () => {
      t.clock.advance(61_000);
      await post(request(t.app), '/auth/signup', valid({ email: 'ravi@example.com', phone: '9123456780' }));
    });

    it('logs in by email or phone', async () => {
      expect((await post(request(t.app), '/auth/login', { identifier: 'RAVI@example.com', password: 'secret123' })).status).toBe(200);
      expect((await post(request(t.app), '/auth/login', { identifier: '+919123456780', password: 'secret123' })).body.account.email).toBe('ravi@example.com');
    });

    it('unknown identifier and wrong password give byte-identical responses (AUTH-005)', async () => {
      const wrong = await post(request(t.app), '/auth/login', { identifier: 'ravi@example.com', password: 'nope1234' });
      const unknown = await post(request(t.app), '/auth/login', { identifier: 'nobody@example.com', password: 'nope1234' });
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(unknown.text).toBe(wrong.text);
      expect(wrong.body).toEqual({ code: 'INVALID_CREDENTIALS', message: 'Incorrect email/phone or password.' });
      // Reset the account's counter.
      await post(request(t.app), '/auth/login', { identifier: 'ravi@example.com', password: 'secret123' });
    });

    it('locks for 15 minutes after 5 failures, even for the right password; unlocks with time; success resets', async () => {
      const attempt = (password: string) => post(request(t.app), '/auth/login', { identifier: 'ravi@example.com', password });
      for (let i = 0; i < 4; i++) expect((await attempt('bad12345')).status).toBe(401);
      const fifth = await attempt('bad12345');
      expect(fifth.status).toBe(423);
      expect(fifth.body.message).toBe('Too many attempts. Try again in 15 minutes.');
      expect((await attempt('secret123')).body.code).toBe('ACCOUNT_LOCKED');
      t.clock.advance(10 * 60_000);
      expect((await attempt('secret123')).body.message).toBe('Too many attempts. Try again in 5 minutes.');
      t.clock.advance(5 * 60_000);
      expect((await attempt('secret123')).status).toBe(200);
      // Counter was reset by the success: 4 more failures don't lock.
      for (let i = 0; i < 4; i++) await attempt('bad12345');
      expect((await attempt('secret123')).status).toBe(200);
    });

    it('unknown identifiers lock the same way after 5 failures from one client (SD-38)', async () => {
      const attempt = () => post(request(t.app), '/auth/login', { identifier: 'ghost@example.com', password: 'bad12345' });
      for (let i = 0; i < 4; i++) expect((await attempt()).body.code).toBe('INVALID_CREDENTIALS');
      const fifth = await attempt();
      expect(fifth.status).toBe(423);
      expect(fifth.body.message).toBe('Too many attempts. Try again in 15 minutes.');
      t.clock.advance(16 * 60_000);
    });

    it('rate limits login per client: 20 a minute (SEC-004)', async () => {
      const codes: number[] = [];
      for (let i = 0; i < 21; i++) codes.push((await post(request(t.app), '/auth/login', { identifier: `rl${i}@example.com`, password: 'x' })).status);
      expect(codes.slice(0, 20).every((c) => c === 401 || c === 423)).toBe(true);
      expect(codes[20]).toBe(429);
    });

    it('unknown and known identifiers take similar time (< 20% apart)', async () => {
      const time = async (identifier: string) => {
        const s = performance.now();
        await post(request(t.app), '/auth/login', { identifier, password: 'wrong-pass-1' });
        return performance.now() - s;
      };
      const known: number[] = [];
      const unknown: number[] = [];
      for (let i = 0; i < 16; i++) {
        t.clock.advance(61_000);
        await post(request(t.app), '/auth/login', { identifier: 'ravi@example.com', password: 'secret123' });
        known.push(await time('ravi@example.com'));
        unknown.push(await time(`timing${i}@example.com`));
      }
      // Lower quartile: the cost of the work itself, least disturbed by other test files sharing the CPU.
      const quartile = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 4)]!;
      const [k, u] = [quartile(known), quartile(unknown)];
      expect(Math.abs(k - u) / Math.max(k, u)).toBeLessThan(0.2);
    });
  });

  describe('password reset (AUTH-008…010)', () => {
    beforeAll(async () => {
      t.clock.advance(61_000);
      await post(request(t.app), '/auth/signup', valid({ email: 'neha@example.com', securityQuestionId: 'q2', securityAnswer: 'Pune' }));
    });

    it('wrong question, wrong answer and unknown identifier are indistinguishable', async () => {
      const a = await post(request(t.app), '/auth/reset/verify', { identifier: 'neha@example.com', securityQuestionId: 'q1', securityAnswer: 'Pune' });
      const b = await post(request(t.app), '/auth/reset/verify', { identifier: 'neha@example.com', securityQuestionId: 'q2', securityAnswer: 'Delhi' });
      const c = await post(request(t.app), '/auth/reset/verify', { identifier: 'nobody2@example.com', securityQuestionId: 'q2', securityAnswer: 'Pune' });
      expect(a.status).toBe(400);
      expect(b.text).toBe(a.text);
      expect(c.text).toBe(a.text);
      expect(a.body.code).toBe('RESET_FAILED');
      expect(JSON.stringify(a.body)).not.toMatch(/q2|question/i);
    });

    it('correct answer → new password; sessions revoked; notice once at next login; token single-use', async () => {
      t.clock.advance(61_000);
      const agent = request.agent(t.app);
      await post(agent, '/auth/login', { identifier: 'neha@example.com', password: 'secret123' });
      expect((await agent.get('/api/v1/auth/session')).body.authenticated).toBe(true);

      const v = await post(request(t.app), '/auth/reset/verify', { identifier: 'neha@example.com', securityQuestionId: 'q2', securityAnswer: '  PUNE ' });
      expect(v.status).toBe(200);
      const done = await post(request(t.app), '/auth/reset/complete', { resetToken: v.body.resetToken, password: 'newpass99', confirmPassword: 'newpass99' });
      expect(done.status).toBe(200);
      expect((await agent.get('/api/v1/auth/session')).body).toMatchObject({ authenticated: false, expired: true });
      expect((await post(request(t.app), '/auth/reset/complete', { resetToken: v.body.resetToken, password: 'again999', confirmPassword: 'again999' })).body.code).toBe('RESET_FAILED');

      expect((await post(request(t.app), '/auth/login', { identifier: 'neha@example.com', password: 'secret123' })).status).toBe(401);
      const first = await post(request(t.app), '/auth/login', { identifier: 'neha@example.com', password: 'newpass99' });
      expect(first.body.notice).toMatch(/^Your password was changed on \d{1,2} \w{3} 2026, \d{1,2}:\d{2} (am|pm)\. If this wasn't you, reset it now\.$/);
      const second = await post(request(t.app), '/auth/login', { identifier: 'neha@example.com', password: 'newpass99' });
      expect(second.body.notice).toBeNull();
    });

    it('locks reset after 5 wrong answers', async () => {
      t.clock.advance(61_000);
      const attempt = () => post(request(t.app), '/auth/reset/verify', { identifier: 'neha@example.com', securityQuestionId: 'q2', securityAnswer: 'wrong' });
      for (let i = 0; i < 4; i++) expect((await attempt()).body.code).toBe('RESET_FAILED');
      expect((await attempt()).body.message).toBe('Too many attempts. Try again in 15 minutes.');
      t.clock.advance(16 * 60_000);
    });
  });

  describe('sessions, logout and recent searches (AUTH-011, AUTH-013, SRC-009)', () => {
    it('expires after 60 idle minutes and after 24 hours regardless of activity', async () => {
      const agent = request.agent(t.app);
      await post(agent, '/auth/login', { identifier: 'ravi@example.com', password: 'secret123' });
      t.clock.advance(59 * 60_000);
      expect((await agent.get('/api/v1/search/recent')).status).toBe(200);
      t.clock.advance(61 * 60_000);
      const idle = await agent.get('/api/v1/search/recent');
      expect(idle.status).toBe(401);
      expect(idle.body.code).toBe('SESSION_EXPIRED');

      t.clock.advance(61_000);
      const b = request.agent(t.app);
      await post(b, '/auth/login', { identifier: 'ravi@example.com', password: 'secret123' });
      // Active every 55 minutes (never idle): still expires at the 24-hour absolute limit.
      for (let elapsed = 55; elapsed <= 30 * 60; elapsed += 55) {
        t.clock.advance(55 * 60_000);
        const r = await b.get('/api/v1/search/recent');
        if (r.status !== 200) {
          expect(r.body.code).toBe('SESSION_EXPIRED');
          expect(elapsed).toBeGreaterThanOrEqual(24 * 60);
          expect(elapsed).toBeLessThan(25 * 60);
          return;
        }
      }
      throw new Error('session never expired');
    });

    it('unauthenticated vs expired errors', async () => {
      expect((await request(t.app).get('/api/v1/search/recent')).body.code).toBe('UNAUTHENTICATED');
    });

    it('logout revokes the session', async () => {
      t.clock.advance(61_000);
      const agent = request.agent(t.app);
      await post(agent, '/auth/login', { identifier: 'ravi@example.com', password: 'secret123' });
      expect((await post(agent, '/auth/logout', {})).status).toBe(200);
      expect((await agent.get('/api/v1/auth/session')).body.authenticated).toBe(false);
    });

    it('merges guest recent searches at login; de-duplicates, newest first, at most 10; clear', async () => {
      t.clock.advance(61_000);
      const agent = request.agent(t.app);
      await post(agent, '/auth/login', { identifier: 'ravi@example.com', password: 'secret123', guest: { recentSearches: ['Jeans', 'kurta'] } });
      t.clock.advance(1000);
      await post(agent, '/search/recent', { term: 'Sneakers' });
      t.clock.advance(1000);
      await post(agent, '/search/recent', { term: 'JEANS' });
      expect((await agent.get('/api/v1/search/recent')).body.terms).toEqual(['JEANS', 'Sneakers', 'kurta']);
      for (let i = 0; i < 12; i++) {
        t.clock.advance(1000);
        await post(agent, '/search/recent', { term: `term ${i}` });
      }
      const terms = (await agent.get('/api/v1/search/recent')).body.terms;
      expect(terms).toHaveLength(10);
      expect(terms[0]).toBe('term 11');
      await agent.delete('/api/v1/search/recent').set('Origin', TEST_ORIGIN);
      expect((await agent.get('/api/v1/search/recent')).body.terms).toEqual([]);
    });
  });
});
