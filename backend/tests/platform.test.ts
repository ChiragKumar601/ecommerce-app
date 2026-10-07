import { Router } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/api/app.js';
import type { AppContext } from '../src/api/context.js';
import { handler, validate } from '../src/api/middleware/core.js';
import { rateLimit } from '../src/api/middleware/rateLimit.js';
import { AppError } from '../src/domain/errors.js';
import { createLogger, redact } from '../src/lib/logger.js';
import { createTestApp, TEST_ORIGIN } from './helpers/testApp.js';

describe('API platform (S4.1–S4.2)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t.cleanup());

  /** Same app, plus probe routes mounted before the 404 handler. */
  function appWithProbe(build: (r: Router, ctx: AppContext) => void) {
    const probe = Router();
    build(probe, t.ctx);
    const app = createApp(t.ctx);
    // Insert the probe router into the /api/v1 stack ahead of apiNotFound.
    const api = (app.router as unknown as { stack: { name: string; handle: { stack: unknown[] } }[] }).stack.find((l) => l.name === 'router')!.handle;
    api.stack.splice(api.stack.length - 1, 0, ...(probe as unknown as { stack: unknown[] }).stack);
    return app;
  }

  it('returns the error envelope for unknown API routes, with a request id', async () => {
    const res = await request(t.app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: 'NOT_FOUND', message: "We couldn't find that." });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sets security headers (helmet)', async () => {
    const res = await request(t.app).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('rejects state-changing requests without an allowed Origin (SEC-001)', async () => {
    const app = appWithProbe((r) => r.post('/probe', (_req, res) => res.json({ ok: true })));
    expect((await request(app).post('/api/v1/probe').send({})).status).toBe(409);
    expect((await request(app).post('/api/v1/probe').set('Origin', 'https://evil.example').send({})).body.code).toBe('ACTION_NOT_ALLOWED');
    expect((await request(app).post('/api/v1/probe').set('Origin', TEST_ORIGIN).send({})).body).toEqual({ ok: true });
  });

  it('validates input with shared schemas and returns field errors (VAL-001)', async () => {
    const app = appWithProbe((r) => r.post('/probe', validate(z.object({ pincode: z.string().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit pincode') })), (req, res) => res.json(req.body)));
    const bad = await request(app).post('/api/v1/probe').set('Origin', TEST_ORIGIN).send({ pincode: '0123' });
    expect(bad.status).toBe(422);
    expect(bad.body).toEqual({
      code: 'VALIDATION_ERROR', message: 'Please check the highlighted fields.',
      fieldErrors: [{ field: 'pincode', code: 'invalid_format', message: 'Enter a valid 6-digit pincode' }],
    });
    expect((await request(app).post('/api/v1/probe').set('Origin', TEST_ORIGIN).send({ pincode: '560001' })).body).toEqual({ pincode: '560001' });
  });

  it('maps malformed JSON to VALIDATION_ERROR and AppErrors to their status', async () => {
    const app = appWithProbe((r) => r.get('/boom', handler(async () => { throw new AppError('OUT_OF_STOCK', { available: 2 }); })));
    const res = await request(app).post('/api/v1/health').set('Origin', TEST_ORIGIN).set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    const boom = await request(app).get('/api/v1/boom');
    expect(boom.status).toBe(409);
    expect(boom.body).toEqual({ code: 'OUT_OF_STOCK', message: 'Only 2 left.', details: { available: 2 } });
  });

  it('hides unexpected errors behind the generic message (GLB-003)', async () => {
    const app = appWithProbe((r) => r.get('/crash', handler(async () => { throw new Error('SQLITE secret internals'); })));
    const res = await request(app).get('/api/v1/crash');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' });
    expect(JSON.stringify(res.body)).not.toContain('SQLITE');
  });

  it('rate-limits per client per minute and reports Retry-After (SEC-004)', async () => {
    const app = appWithProbe((r, ctx) => r.get('/limited', rateLimit(ctx.db, ctx.clock, { group: 'probe', perMinute: 3 }), (_q, res) => res.json({ ok: true })));
    for (let i = 0; i < 3; i += 1) expect((await request(app).get('/api/v1/limited')).status).toBe(200);
    const limited = await request(app).get('/api/v1/limited');
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    t.clock.advance(60_000);
    expect((await request(app).get('/api/v1/limited')).status).toBe(200);
  });

  it('redacts secrets from logs (SEC-002, SEC-003)', () => {
    const lines: string[] = [];
    createLogger('info', (l) => lines.push(l)).log('info', 'x', { password: 'p', body: { cardNumber: '4111', cvv: '123', otp: '1234', name: 'ok' } });
    expect(lines[0]).not.toMatch(/4111|"123"|1234|"p"/);
    expect(lines[0]).toContain('"name":"ok"');
    expect(redact({ securityAnswer: 'x' })).toEqual({ securityAnswer: '[redacted]' });
  });

  it('notifies listeners when the catalogue version changes (PR-22)', async () => {
    let seen = -1;
    t.ctx.settings.on('catalogueChanged', (v: number) => (seen = v));
    await t.ctx.settings.refresh();
    await t.ctx.db.setting.upsert({ where: { key: 'catalogue_version' }, create: { key: 'catalogue_version', value: 7 }, update: { value: 7 } });
    await t.ctx.settings.refresh();
    expect(seen).toBe(7);
    expect(await t.ctx.settings.get('missing', 'fallback')).toBe('fallback');
  });
});

describe('GET /api/v1/site (GLB-001)', () => {
  it('returns the brand name and demo banner text from settings', async () => {
    const t = await createTestApp({
      seed: async (ctx) => {
        await ctx.db.setting.create({ data: { key: 'demoBanner.text', value: 'Demo store — for showcase only.' } });
      },
    });
    const res = await request(t.app).get('/api/v1/site');
    expect(res.body).toEqual({ brandName: 'Wardrobe & Co.', demoBanner: 'Demo store — for showcase only.' });
    await t.cleanup();
  });
});
