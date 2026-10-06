import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/api/app.js';

describe('GET /api/v1/health', () => {
  it('reports the backend is up', async () => {
    const res = await request(createApp()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'backend' });
  });

  it('does not expose the x-powered-by header', async () => {
    const res = await request(createApp()).get('/api/v1/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
