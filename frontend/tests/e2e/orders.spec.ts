import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { placedCodOrder } from './helpers';

// E2E runs with 2 s status steps and an 8 s handover window (prepare-e2e-db).
test.describe('orders, fulfilment and the delivery simulator (S16)', () => {
  test.describe.configure({ timeout: 90_000 });

  test('UF-07: COD order moves to Out for Delivery; the OTP in the simulator delivers it; the unseen dot clears (ORD-004, DLV-001…003, PRF-007)', async ({ page }) => {
    const { orderId, orderNumber } = await placedCodOrder(page);
    await page.goto('/account/orders');
    await expect(page.getByRole('link', { name: new RegExp(`Order ${orderNumber}`) })).toBeVisible();
    await page.getByRole('link', { name: new RegExp(`Order ${orderNumber}`) }).click();
    await expect(page).toHaveURL(new RegExp(`/account/orders/${orderId}$`));
    await expect(page.getByRole('heading', { name: 'Delivery simulator (demo)' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Share this OTP with the delivery person to receive your order.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Tracking' })).toContainText(/TRK[A-Z0-9]{10}/);
    const otp = (await page.getByRole('region', { name: 'Your delivery OTP' }).locator('.tabular').innerText()).trim();
    const wrong = String((Number(otp) + 1) % 10_000).padStart(4, '0');
    await page.getByRole('textbox', { name: 'Delivery OTP' }).fill(wrong);
    await page.getByRole('button', { name: 'Confirm delivery' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Incorrect OTP' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Delivery OTP' }).fill(otp);
    await page.getByRole('button', { name: 'Confirm delivery' }).click();
    await expect(page.getByText(/^Delivered on /)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Delivery simulator (demo)' })).toBeHidden();
    await expect(page.getByRole('region', { name: 'Payment' })).toContainText('Collected');
    await expect(page.getByRole('link', { name: /^Profile$/ })).toBeVisible();
  });

  test('UF-09: no action → Delivery Attempt Failed → Out for Delivery again → Returned to Origin (DLV-006)', async ({ page }) => {
    const { orderId } = await placedCodOrder(page);
    await page.goto(`/account/orders/${orderId}`);
    await expect(page.getByText('Attempt 1 of 2')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Attempt 2 of 2')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Returned to Origin').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Delivery simulator (demo)' })).toBeHidden();
  });

  test('Customer rejected parcel asks for confirmation → Rejected at Delivery (DLV-005)', async ({ page }) => {
    const { orderId } = await placedCodOrder(page);
    await page.goto(`/account/orders/${orderId}`);
    await page.getByRole('button', { name: 'Customer rejected parcel' }).click({ timeout: 60_000 });
    const dialog = page.getByRole('dialog', { name: 'Customer rejected the parcel?' });
    await dialog.getByRole('button', { name: 'Reject parcel' }).click();
    await expect(page.getByText('Rejected at Delivery').first()).toBeVisible();
  });

  test('orders list and detail pass axe; the Profile icon shows the unseen dot (PRF-007)', async ({ page }) => {
    const { orderId } = await placedCodOrder(page);
    await expect.poll(async () => (await page.request.get('/api/v1/auth/session')).json().then((s: { hasUnseenOrderUpdates: boolean }) => s.hasUnseenOrderUpdates), { timeout: 20_000 }).toBe(true);
    await page.goto('/account');
    await expect(page.getByRole('link', { name: 'Profile, order updates' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Orders, new updates' })).toBeVisible();
    await page.goto('/account/orders');
    await expect(page.getByRole('heading', { level: 1, name: 'Orders' })).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
    await page.goto(`/account/orders/${orderId}`);
    await expect(page.getByRole('heading', { name: 'Order status' })).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
    await expect(page.getByRole('link', { name: 'Profile', exact: true })).toBeVisible({ timeout: 10_000 });
  });
});
