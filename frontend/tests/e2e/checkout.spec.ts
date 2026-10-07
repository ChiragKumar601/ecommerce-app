import { expect, test, type Page } from '@playwright/test';
import { apiCall, PASSWORD, signUpViaApi } from './helpers';

/** A logged-in customer with one bag line, optionally a phone and an address. */
export async function customerWithBag(page: Page, opts: { phone?: boolean; address?: string | false; listing?: string } = {}) {
  const phone = opts.phone === false ? '' : `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
  const { email } = await signUpViaApi(page, { phone });
  if (opts.address !== false) {
    await apiCall(page, 'POST', '/me/addresses', {
      recipientName: 'Test Shopper', recipientPhone: '9876543210', houseFlat: '7', streetArea: 'MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: opts.address ?? '560001', labelType: 'Home',
    });
  }
  const list = await apiCall<{ items: { id: string }[] }>(page, 'GET', `/products?scope=node&node=${opts.listing ?? 'men/topwear/jackets'}&inStock=1`);
  const product = await apiCall<{ variants: { id: string; available: number }[] }>(page, 'GET', `/products/${list.body.items[0]!.id}`);
  const variant = product.body.variants.find((v) => v.available > 0)!;
  await apiCall(page, 'POST', '/bag/lines', { variantId: variant.id });
  return { email, variantId: variant.id, productId: list.body.items[0]!.id };
}

test.describe('checkout (S14)', () => {
  test.beforeEach(async ({ page }) => page.route(/api\.mapbox\.com/, (r) => r.abort()));

  test('bag → checkout: phone, add address, summary, payment step (CHK-001, CHK-003, CHK-004, CHK-005)', async ({ page }) => {
    await customerWithBag(page, { phone: false, address: false });
    await page.goto('/bag');
    await page.getByRole('button', { name: 'Proceed to Checkout' }).click();
    await expect(page).toHaveURL(/\/checkout\?c=/);
    await expect(page.getByRole('list', { name: 'Checkout progress' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();

    await page.getByLabel('Mobile number').fill(`9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`);
    await page.getByRole('button', { name: 'Save number' }).click();
    await expect(page.getByText(/Contact number: \+91/)).toBeVisible();

    await page.getByRole('button', { name: 'Add new address' }).click();
    const d = page.getByRole('dialog', { name: 'Add a new address' });
    await expect(d.getByLabel('Recipient phone')).not.toHaveValue('');
    await d.getByLabel('House / flat').fill('22B');
    await d.getByLabel('Street / area').fill('Residency Road');
    await d.getByLabel('City').fill('Bengaluru');
    await d.getByLabel('State').selectOption('Karnataka');
    await d.getByLabel('Pincode').fill('560001');
    await d.getByRole('button', { name: 'Save address' }).click();
    await expect(page.getByRole('radio', { name: /22B/ })).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Items' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Delivery address' })).toContainText('22B');
    await page.getByRole('button', { name: 'Continue to Payment' }).click();
    await expect(page.locator('[aria-current="step"]')).toContainText('Payment');
  });

  test('an unserviceable address is shown but cannot be selected (UF-14, CHK-004)', async ({ page }) => {
    await customerWithBag(page, { address: '999999' });
    await page.goto('/bag');
    await page.getByRole('button', { name: 'Proceed to Checkout' }).click();
    const radio = page.getByRole('radio', { name: /Not deliverable/ });
    await expect(radio).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  });

  test('Buy Now goes to checkout with only that item; the bag is unchanged (PDP-009, CHK-006)', async ({ page }) => {
    await customerWithBag(page);
    await page.goto('/men/topwear/jackets?inStock=1');
    await page.locator('main article').nth(1).getByRole('heading').getByRole('link').click();
    await page.getByRole('radiogroup', { name: 'Select size' }).getByRole('radio').and(page.locator(':not([disabled])')).first().click();
    await page.getByRole('button', { name: 'Buy Now' }).click();
    await expect(page).toHaveURL(/\/checkout\?c=/);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const items = page.getByRole('region', { name: 'Items' });
    await expect(items.getByRole('listitem')).toHaveCount(1);
    await items.getByLabel('Quantity').selectOption('2');
    await expect(items).toContainText('Items (2)');
    await expect(page.getByRole('link', { name: /^Bag, 1 item/ })).toBeVisible();
  });

  test('UF-15: the session expires on Summary → login dialog → back on Summary with its state (AUTH-011, CHK-007)', async ({ page, context }) => {
    const { email } = await customerWithBag(page);
    await page.goto('/bag');
    await page.getByRole('button', { name: 'Proceed to Checkout' }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Items' })).toBeVisible();

    // Expire the session on the server while the browser keeps its cookie.
    const cookies = await context.cookies();
    await apiCall(page, 'POST', '/auth/logout');
    await context.addCookies(cookies);

    await page.getByLabel('Coupon code').fill('WELCOME10');
    await page.getByRole('button', { name: 'Apply' }).click();
    const dialog = page.getByRole('dialog', { name: 'Please log in again' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/Email or mobile number/).fill(email);
    await dialog.getByLabel(/^Password/).fill(PASSWORD);
    await dialog.getByRole('button', { name: 'Log in' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('region', { name: 'Items' })).toBeVisible();
    await expect(page.getByText(/WELCOME10/).first()).toBeVisible();
    await expect(page.locator('[aria-current="step"]')).toContainText('Summary');
  });
});
