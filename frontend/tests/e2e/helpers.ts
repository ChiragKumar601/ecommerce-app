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
