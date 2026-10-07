import request from 'supertest';
import { expect } from 'vitest';
import { resolvePaymentAttempts } from '../../src/services/payment.js';
import type { FxProduct } from './catalogueFixture.js';
import type { createTestApp } from './testApp.js';
import { TEST_ORIGIN } from './testApp.js';

export type Agent = ReturnType<typeof request.agent>;
type T = Awaited<ReturnType<typeof createTestApp>>;

/** Products used by the order tests (WX-1 set plus spares). */
export const ORDER_FIXTURE: FxProduct[] = [
  { id: 'p-tee', name: 'Crew T-shirt', brand: 'Northlane', nodes: ['men/topwear/t-shirts'], variants: [{ size: 'M', mrp: 1499, price: 999, stock: 200 }], bankOffer: true },
  { id: 'p-snk', name: 'Runner Sneakers', brand: 'Kestrel', nodes: ['men/footwear/sneakers'], variants: [{ size: '9', mrp: 3999, price: 2799, stock: 200 }], bankOffer: true },
  { id: 'p-sock', name: 'Ankle Socks', brand: 'Northlane', nodes: ['men/topwear/t-shirts'], variants: [{ size: 'Free', mrp: 499, price: 399, stock: 50 }] },
  { id: 'p-cap', name: 'Baseball Cap', brand: 'Northlane', nodes: ['men/topwear/t-shirts'], variants: [{ size: 'Free', mrp: 799, price: 599, stock: 50 }] },
  { id: 'p-belt', name: 'Leather Belt', brand: 'Kestrel', nodes: ['men/topwear/t-shirts'], variants: [{ size: '34', mrp: 1299, price: 999, stock: 50 }] },
  { id: 'p-ser', name: 'Face Serum', brand: 'Glowly', gender: 'none', nodes: ['beauty/skincare/serum'], variants: [{ size: 'One Size', mrp: 899, price: 719, stock: 200 }] },
];

let n = 0;

export function orderHelpers(t: T) {
  const send = (a: Agent, method: 'post' | 'put' | 'patch' | 'delete', path: string, body?: unknown, key?: string) => {
    const r = a[method](`/api/v1${path}`).set('Origin', TEST_ORIGIN);
    if (key) r.set('Idempotency-Key', key);
    return r.send(body as object);
  };
  const ok = <B = Record<string, unknown>>(r: { status: number; body: B }, status = 200): B => {
    expect(r.status, JSON.stringify(r.body)).toBe(status);
    return r.body;
  };
  async function customer(): Promise<Agent> {
    const a = request.agent(t.app);
    ok(await send(a, 'post', '/auth/signup', { name: 'Order Tester', email: `ord${n}-${Date.now()}@example.com`, phone: `97${String(10_000_000 + n++).slice(-8)}`, password: 'secret123', confirmPassword: 'secret123', securityQuestionId: 'q1', securityAnswer: 'blue', ageConfirmed: true }), 201);
    ok(await send(a, 'post', '/me/addresses', { recipientName: 'Order Tester', recipientPhone: '9876543210', houseFlat: '1', streetArea: 'MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001', labelType: 'Home' }), 201);
    return a;
  }
  /** Places an order through the API (COD by default, or a forced-success UPI). Returns the order id. */
  async function placeOrder(a: Agent, lines: [string, number][], method: 'cod' | 'upi' = 'cod'): Promise<string> {
    for (const [v, q] of lines) ok(await send(a, 'post', '/bag/lines', { variantId: v, quantity: q }));
    const c = ok<{ id: string }>(await send(a, 'post', '/checkout', { source: 'bag' }), 201);
    ok(await send(a, 'put', `/checkout/${c.id}/step`, { step: 'payment' }));
    const v = ok<{ quoteId: string }>(await send(a, 'put', `/checkout/${c.id}/payment-selection`, { method }));
    const att = ok<{ order: { id: string } }>(await send(a, 'post', `/checkout/${c.id}/pay`, { quoteId: v.quoteId, payment: method === 'cod' ? { method } : { method, upiId: 'success@demo' } }), 201);
    if (method === 'upi') {
      t.clock.advance(3_100);
      await resolvePaymentAttempts(t.ctx);
    }
    return att.order.id;
  }
  const order = (a: Agent, id: string) => a.get(`/api/v1/orders/${id}`).then((r) => r.body);
  return { send, ok, customer, placeOrder, order };
}
