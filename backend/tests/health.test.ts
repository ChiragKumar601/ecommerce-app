import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/testApp.js';
import type { Express } from 'express';

let app: Express;
let cleanup: () => Promise<void>;
beforeAll(async () => {
  const t = await createTestApp();
  app = t.app;
  cleanup = t.cleanup;
});
afterAll(async () => cleanup());

describe('GET /api/v1/health', () => {
  it('reports the backend is up', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'backend' });
  });

  it('does not expose the x-powered-by header', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
