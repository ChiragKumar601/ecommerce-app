import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/testApp.js';
import type { Express } from 'express';

const dir = resolve(import.meta.dirname, '../storage/catalogue');
const file = resolve(dir, 'test0000test0000.webp');

let app: Express;
let cleanup: () => Promise<void>;
beforeAll(async () => {
  const t = await createTestApp();
  app = t.app;
  cleanup = t.cleanup;
});
afterAll(async () => cleanup());

describe('GET /media/catalogue (OD-11)', () => {
  beforeAll(() => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, Buffer.from('RIFF0000WEBP'));
  });
  afterAll(() => rmSync(file, { force: true }));

  it('serves catalogue images with long-lived caching', async () => {
    const res = await request(app).get('/media/catalogue/test0000test0000.webp');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/webp');
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('returns 404 for missing files and does not list the folder', async () => {
    expect((await request(app).get('/media/catalogue/missing.webp')).status).toBe(404);
    expect((await request(app).get('/media/catalogue/')).status).toBe(404);
  });
});

describe('GET /media/placeholder', () => {
  it('serves the on-theme section placeholders', async () => {
    for (const section of ['men', 'women', 'kids', 'home', 'beauty', 'gen-z']) {
      const res = await request(app).get(`/media/placeholder/${section}.svg`);
      expect(res.status, section).toBe(200);
      expect(res.headers['content-type']).toContain('image/svg+xml');
    }
  });
});
