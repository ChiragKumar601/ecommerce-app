import { expect, test, type Page } from '@playwright/test';
import { apiCall, signUpViaApi } from './helpers';

/** A customer with a 3-line order paid by UPI (always succeeds). */
async function threeLineOrder(page: Page) {
  await signUpViaApi(page, { phone: `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}` });
  await apiCall(page, 'POST', '/me/addresses', { recipientName: 'Test Shopper', recipientPhone: '9876543210', houseFlat: '7', streetArea: 'MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001', labelType: 'Home' });
  for (const listing of ['men/topwear/jackets', 'men/footwear/sneakers', 'women/western-wear/tops']) {
    const list = await apiCall<{ items: { id: string }[] }>(page, 'GET', `/products?scope=node&node=${listing}&inStock=1`);
    const p = list.body.items[Math.floor(Math.random() * list.body.items.length)]!;
    const product = await apiCall<{ variants: { id: string; available: number }[] }>(page, 'GET', `/products/${p.id}`);
    await apiCall(page, 'POST', '/bag/lines', { variantId: product.body.variants.find((v) => v.available > 1)!.id });
  }
  const c = await apiCall<{ id: string }>(page, 'POST', '/checkout', { source: 'bag' });
  await apiCall(page, 'PUT', `/checkout/${c.body.id}/step`, { step: 'payment' });
  const v = await apiCall<{ quoteId: string }>(page, 'PUT', `/checkout/${c.body.id}/payment-selection`, { method: 'upi' });
  const att = await apiCall<{ order: { id: string } }>(page, 'POST', `/checkout/${c.body.id}/pay`, { quoteId: v.body.quoteId, payment: { method: 'upi', upiId: 'success@demo' } });
  const id = att.body.order.id;
  await expect.poll(async () => (await apiCall<{ status: string }>(page, 'GET', `/orders/${id}`)).body.status, { timeout: 15_000 }).not.toBe('AWAITING_PAYMENT');
  return id;
}

test.describe('refunds and cancellation (S17)', () => {
  test.describe.configure({ timeout: 90_000 });

  test('UF-10: cancel one item with a reason and refund preview → Refunded; cancel the rest → order Cancelled with delivery refunded (CNL-003, CNL-004, RFD-006)', async ({ page }) => {
    const id = await threeLineOrder(page);
    await page.goto(`/account/orders/${id}`);
    const cancelButtons = page.getByRole('button', { name: 'Cancel item' });
    await expect(cancelButtons).toHaveCount(3);
    await cancelButtons.nth(1).click();
    const dialog = page.getByRole('dialog', { name: 'Cancel item' });
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await expect(dialog.getByText('Choose a reason')).toBeVisible();
    await dialog.getByRole('radio', { name: 'Found a better price' }).click();
    await dialog.getByRole('button', { name: 'Continue' }).click();
    const review = page.getByRole('dialog', { name: 'Review cancellation' });
    await expect(review.getByText(/^Refund ₹[\d,.]+$/)).toBeVisible();
    await expect(review.getByText(/to success@demo$/)).toBeVisible();
    await review.getByRole('button', { name: 'Cancel item' }).click();
    await expect(review).toBeHidden();
    const refunds = page.getByRole('region', { name: 'Refunds' });
    await expect(refunds.getByText('Refund Initiated')).toBeVisible();
    await expect(page.getByText(/· 1 item cancelled$/)).toBeVisible();
    await expect(refunds.getByText('Refunded', { exact: true })).toBeVisible({ timeout: 30_000 });

    // The other two lines, quickly, before the order ships.
    const o = await apiCall<{ lines: { id: string; lineState: string }[] }>(page, 'GET', `/orders/${id}`);
    for (const l of o.body.lines.filter((x) => x.lineState === 'active')) {
      const r = await apiCall(page, 'POST', `/orders/${id}/lines/${l.id}/cancel`, { reason: 'Changed my mind' });
      expect(r.status).toBe(200);
    }
    await page.reload();
    await expect(page.getByText('Cancelled', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel item' })).toHaveCount(0);
    await expect(refunds.getByRole('listitem')).toHaveCount(3);
  });
});
