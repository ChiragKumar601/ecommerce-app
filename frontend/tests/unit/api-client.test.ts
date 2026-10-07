import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, errorMessage, setUnauthorizedHandler } from '../../src/lib/api-client';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setUnauthorizedHandler(null);
  });

  it('returns JSON and sends the idempotency key header (API-003)', async () => {
    const fetchMock = vi.fn(async () => json(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await api('/x', { method: 'POST', body: { a: 1 }, idempotencyKey: 'k1' })).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/x');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('k1');
    expect(init.credentials).toBe('same-origin');
  });

  it('throws ApiError with the envelope, including field errors (API-002)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(422, { code: 'VALIDATION_ERROR', message: 'Please check the highlighted fields.', fieldErrors: [{ field: 'pincode', code: 'x', message: 'Enter a valid 6-digit pincode' }] })));
    const err = (await api("/x").catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.field('pincode')).toBe('Enter a valid 6-digit pincode');
  });

  it('uses the generic message for network failures and non-JSON errors (GLB-003)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(errorMessage(await api('/x').catch((e) => e))).toBe('Something went wrong. Please try again.');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 502 })));
    const err = (await api("/x").catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.message).toBe('Something went wrong. Please try again.');
  });

  it('hands SESSION_EXPIRED to the session layer, which can retry (AUTH-011)', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => (++calls === 1 ? json(401, { code: 'SESSION_EXPIRED', message: 'Your session has expired. Please log in again.' }) : json(200, { ok: true }))));
    setUnauthorizedHandler((_err, retry) => retry());
    expect(await api('/x')).toEqual({ ok: true });
    expect(calls).toBe(2);
  });
});
