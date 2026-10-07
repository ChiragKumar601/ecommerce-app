import { expect, test, type Page } from '@playwright/test';
import { customerWithBag } from './helpers';

/** From the bag to the Payment step. */
async function toPayment(page: Page) {
  await page.goto('/bag');
  await page.getByRole('button', { name: 'Proceed to Checkout' }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to Payment' }).click();
  await expect(page.getByText('This is a demo — do not enter real card details.')).toBeVisible();
}

async function newCard(page: Page, number: string) {
  await page.getByRole('radio', { name: /^Card/ }).click();
  const add = page.getByRole('radio', { name: 'Add new card' });
  if (await add.isVisible().catch(() => false)) await add.click();
  await page.getByLabel('Card number').fill(number);
  await page.getByLabel('Name on card').fill('Test Shopper');
  await page.getByLabel(/Expiry/).fill('1230');
  await page.getByLabel('CVV').fill('123');
}

test.describe('payment and order creation (S15)', () => {
  test.beforeEach(async ({ page }) => page.route(/api\.mapbox\.com/, (r) => r.abort()));

  test('UF-04: HDFC test card → processing → confirmation; the bag empties (PAY-001…009, PAY-013)', async ({ page }) => {
    await customerWithBag(page);
    await toPayment(page);
    await newCard(page, '4000000110000009');
    const pay = page.getByRole('button', { name: /^Pay ₹/ });
    await expect(pay).toBeVisible();
    await pay.click();
    await expect(page.getByRole('dialog', { name: 'Processing payment…' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Order placed' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/^Order number ORD-\d{6}-[A-Z0-9]{5}$/)).toBeVisible();
    await expect(page.getByText(/^Delivery by /)).toBeVisible();
    await expect(page.getByText('Paid online')).toBeVisible();
    await expect(page.getByRole('link', { name: /^Bag/ })).toHaveAccessibleName('Bag');
  });

  test('UF-05: failure → message and Retry → pending-order dialog from the bag → UPI success (PAY-010, PAY-011, CHK-010)', async ({ page }) => {
    await customerWithBag(page);
    await toPayment(page);
    await newCard(page, '4000000120000007');
    await page.getByRole('button', { name: /^Pay ₹/ }).click();
    await expect(page.getByRole('heading', { name: 'Payment failed. No money was taken.' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/You can retry for \d+ more minutes?\./)).toBeVisible();

    // Leave, then come back through Proceed to Checkout: the bag is unchanged and the pending order is offered.
    await page.goto('/bag');
    await expect(page.getByRole('list', { name: 'Items in your bag' }).getByRole('listitem')).toHaveCount(1);
    await page.getByRole('button', { name: 'Proceed to Checkout' }).click();
    const dialog = page.getByRole('dialog', { name: 'You have an order waiting for payment' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Retry payment' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Retry payment' })).toBeVisible();
    await page.getByRole('radio', { name: /^UPI/ }).click();
    await page.getByLabel('UPI ID').fill('success@demo');
    await page.getByRole('button', { name: /^Pay ₹/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Order placed' })).toBeVisible({ timeout: 15_000 });
  });

  test('UF-06: redeem a gift card inline and use credits → "Place order" with no simulator (PRC-008, PAY-008)', async ({ page }) => {
    await customerWithBag(page, { listing: 'home/furnishings/cushions' });
    await toPayment(page);
    await page.getByRole('button', { name: 'Redeem a code' }).click();
    await page.getByLabel('Gift card code').fill('DEMOGIFT5000');
    await page.getByRole('button', { name: 'Redeem', exact: true }).click();
    await expect(page.getByLabel('Gift card', { exact: true })).not.toHaveValue('');
    await page.getByRole('switch', { name: /Use credits/ }).click();
    await expect(page.getByText('Your gift card and credits cover the whole amount. No other payment is needed.')).toBeVisible();
    await page.getByRole('button', { name: 'Place order', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Order placed' })).toBeVisible();
    await expect(page.getByText('Paid by gift card')).toBeVisible();
  });

  test('Cash on Delivery shows the amount due on the confirmation page (PAY-005, PAY-013)', async ({ page }) => {
    await customerWithBag(page, { listing: 'home/furnishings/cushions' });
    await toPayment(page);
    await page.getByRole('radio', { name: /^Cash on Delivery/ }).click();
    await page.getByRole('button', { name: /^Place order \(pay ₹[\d,]+ on delivery\)$/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Order placed' })).toBeVisible();
    await expect(page.getByText(/^Pay ₹[\d,.]+ on delivery$/)).toBeVisible();
  });
});
