import type { Page } from '@playwright/test';

export const ORIGIN = 'http://localhost:4173';
export const PASSWORD = 'secret123';

let n = 0;
export const uniqueEmail = (tag = 'e2e') => `${tag}.${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}@example.com`;

/** Calls the API from the page's browser context (shares its cookies). */
export async function apiCall<T = unknown>(page: Page, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: T }> {
  const res = await page.request.fetch(`/api/v1${path}`, { method, data: body as object, headers: { Origin: ORIGIN, ...headers } });
  const text = await res.text();
  return { status: res.status(), body: (text ? JSON.parse(text) : undefined) as T };
}

/** Signs up a fresh account through the API, leaving the page's context logged in. */
export async function signUpViaApi(page: Page, over: Record<string, unknown> = {}) {
  const email = uniqueEmail();
  const q = await apiCall<{ id: string }[]>(page, 'GET', '/auth/security-questions');
  const r = await apiCall(page, 'POST', '/auth/signup', {
    name: 'Test Shopper', email, phone: '', password: PASSWORD, confirmPassword: PASSWORD,
    securityQuestionId: q.body[0]!.id, securityAnswer: 'blue moon', ageConfirmed: true, ...over,
  });
  if (r.status !== 201) throw new Error(`sign-up failed: ${r.status} ${JSON.stringify(r.body)}`);
  return { email, questionId: q.body[0]!.id };
}

/** A logged-in customer with one bag line, optionally a phone and an address. */
export async function customerWithBag(page: Page, opts: { phone?: boolean; address?: string | false; listing?: string } = {}) {
  const phone = opts.phone === false ? '' : `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
  const { email } = await signUpViaApi(page, { phone });
  if (opts.address !== false) {
    await apiCall(page, 'POST', '/me/addresses', {
      recipientName: 'Test Shopper', recipientPhone: '9876543210', houseFlat: '7', streetArea: 'MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: opts.address ?? '560001', labelType: 'Home',
    });
  }
  // A random in-stock product and size, so parallel tests (and their stock holds) don't compete for one unit.
  const list = await apiCall<{ items: { id: string }[] }>(page, 'GET', `/products?scope=node&node=${opts.listing ?? 'men/topwear/jackets'}&inStock=1`);
  const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!;
  const productId = pick(list.body.items).id;
  const product = await apiCall<{ variants: { id: string; available: number }[] }>(page, 'GET', `/products/${productId}`);
  const variant = pick(product.body.variants.filter((v) => v.available > 1));
  await apiCall(page, 'POST', '/bag/lines', { variantId: variant.id });
  return { email, variantId: variant.id, productId };
}


/** A customer with a placed Cash on Delivery order (bag → checkout → pay through the API). */
export async function placedCodOrder(page: Page) {
  const who = await customerWithBag(page, { listing: 'home/furnishings/cushions' });
  const c = await apiCall<{ id: string }>(page, 'POST', '/checkout', { source: 'bag' });
  await apiCall(page, 'PUT', `/checkout/${c.body.id}/step`, { step: 'payment' });
  const v = await apiCall<{ quoteId: string }>(page, 'PUT', `/checkout/${c.body.id}/payment-selection`, { method: 'cod' });
  const att = await apiCall<{ order: { id: string; orderNumber: string } }>(page, 'POST', `/checkout/${c.body.id}/pay`, { quoteId: v.body.quoteId, payment: { method: 'cod' } });
  if (att.status !== 201) throw new Error(`pay failed: ${att.status} ${JSON.stringify(att.body)}`);
  return { ...who, orderId: att.body.order.id, orderNumber: att.body.order.orderNumber };
}
