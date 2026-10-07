import { expect, test, type Page } from '@playwright/test';
import { apiCall, customerWithBag } from './helpers';

/** A delivered order for `qty` units of one product (COD, delivered through the simulator API). */
async function deliveredOrder(page: Page, qty: number) {
  const who = await customerWithBag(page, { listing: 'men/topwear/jackets' });
  await apiCall(page, 'PATCH', `/bag/lines/${who.variantId}`, { quantity: qty });
  const c = await apiCall<{ id: string }>(page, 'POST', '/checkout', { source: 'bag' });
  await apiCall(page, 'PUT', `/checkout/${c.body.id}/step`, { step: 'payment' });
  const v = await apiCall<{ quoteId: string }>(page, 'PUT', `/checkout/${c.body.id}/payment-selection`, { method: 'upi' });
  const att = await apiCall<{ order: { id: string } }>(page, 'POST', `/checkout/${c.body.id}/pay`, { quoteId: v.body.quoteId, payment: { method: 'upi', upiId: 'success@demo' } });
  const id = att.body.order.id;
  await expect.poll(async () => (await apiCall<{ status: string }>(page, 'GET', `/orders/${id}`)).body.status, { timeout: 60_000, intervals: [1000] }).toBe('OUT_FOR_DELIVERY');
  const o = await apiCall<{ deliveryOtp: string }>(page, 'GET', `/orders/${id}`);
  expect((await apiCall(page, 'POST', `/orders/${id}/delivery-sim/confirm`, { otp: o.body.deliveryOtp })).status).toBe(200);
  return id;
}

async function requestReturn(page: Page, comment: string, quantity?: string) {
  await page.getByRole('button', { name: 'Return', exact: true }).click();
  const d = page.getByRole('dialog', { name: 'Return item' });
  if (quantity) await d.getByLabel('Quantity to return').selectOption(quantity);
  await d.getByRole('radio', { name: 'Size too small' }).click();
  await d.getByLabel(/Comment/).fill(comment);
  await d.getByRole('button', { name: 'Continue' }).click();
  const review = page.getByRole('dialog', { name: 'Review return' });
  await expect(review.getByText(/^Estimated refund ₹[\d,.]+$/)).toBeVisible();
  await expect(review.getByText(/^Pickup from /)).toBeVisible();
  await review.getByRole('button', { name: 'Submit return' }).click();
  await expect(review).toBeHidden();
}

test.describe('returns (S18)', () => {
  test.describe.configure({ timeout: 150_000 });

  test('UF-11: return 1 of 2 units with #approve → … → Refunded; then #reject with a reason (RET-002…004, RET-006, RET-007)', async ({ page }) => {
    const id = await deliveredOrder(page, 2);
    await page.goto(`/account/orders/${id}`);
    await expect(page.getByText(/^Return by /)).toBeVisible();
    await requestReturn(page, 'Too tight #approve', '1');
    await expect(page.getByText('Return Requested', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Refunded', { exact: true }).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/· 1 item returned$/)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Refunds' })).toContainText('Return');

    await requestReturn(page, 'please #reject');
    await expect(page.getByText('Return Rejected', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/^(Item shows signs of use|Tags or packaging missing|Item doesn't match our records)$/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Return', exact: true })).toHaveCount(0);
  });

  test('UF-11 branch: #pickupfail twice → Return Closed (RET-005)', async ({ page }) => {
    const id = await deliveredOrder(page, 1);
    await page.goto(`/account/orders/${id}`);
    await requestReturn(page, '#pickupfail');
    await expect(page.getByText('Return Closed', { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Pickup couldn't be completed after 2 attempts. Your return has been closed.")).toBeVisible();
  });
});
