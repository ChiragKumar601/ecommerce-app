import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signUpViaApi } from './helpers';

async function fillAddress(page: Page, a: { house: string; pincode: string; city?: string; state?: string }) {
  const d = page.getByRole('dialog', { name: 'Add a new address' });
  await d.getByLabel('Recipient phone').fill('9876543210');
  await d.getByLabel('House / flat').fill(a.house);
  await d.getByLabel('Street / area').fill('MG Road');
  await d.getByLabel('City').fill(a.city ?? 'Bengaluru');
  await d.getByLabel('State').selectOption(a.state ?? 'Karnataka');
  await d.getByLabel('Pincode').fill(a.pincode);
  await d.getByRole('button', { name: 'Save address' }).click();
  await expect(d).toBeHidden();
}

test.describe('addresses (S13)', () => {
  test.beforeEach(async ({ page }) => {
    // The map provider is unavailable in these tests (EC-19).
    await page.route(/api\.mapbox\.com/, (r) => r.abort());
  });

  test('UF-14: map unavailable → manual entry → unserviceable pincode is saved and flagged (ADDR-003, ADDR-004)', async ({ page }) => {
    await signUpViaApi(page);
    await page.goto('/account/addresses');
    await expect(page.getByText('No saved addresses')).toBeVisible();
    await page.getByRole('button', { name: 'Add address' }).first().click();
    const d = page.getByRole('dialog', { name: 'Add a new address' });
    await expect(d.getByText('Map unavailable — enter your address manually.')).toBeVisible();
    await expect(d.getByLabel('Recipient name')).toHaveValue('Test Shopper');
    await d.getByRole('button', { name: 'Save address' }).click();
    await expect(d.getByText('This field is required').first()).toBeVisible();
    await fillAddress(page, { house: 'Flat 9', pincode: '999999' });
    await expect(page.getByText("We don't deliver to 999999 yet. You can save this address, but it can't be used for delivery.", { exact: true })).toBeVisible();
    const card = page.getByRole('listitem').filter({ hasText: 'Flat 9' });
    await expect(card).toContainText('Not deliverable');
    await expect(card).toContainText('Default');
  });

  test('serviceable address, default switching and delete with confirmation; bag and PDP use the default (ADDR-005, ADDR-006, BAG-010, PDP-007)', async ({ page }) => {
    await signUpViaApi(page);
    await page.goto('/account/addresses');
    await page.getByRole('button', { name: 'Add address' }).first().click();
    await fillAddress(page, { house: 'First Home', pincode: '110001', city: 'New Delhi', state: 'Delhi' });
    await page.getByRole('button', { name: 'Add address' }).first().click();
    await fillAddress(page, { house: 'Second Home', pincode: '560001' });
    const second = page.getByRole('listitem').filter({ hasText: 'Second Home' });
    await expect(second).toContainText(/Delivery by/);
    await second.getByRole('button', { name: 'Set as default' }).click();
    await expect(second).toContainText('Default');

    // PDP pincode defaults to the default address; the bag shows the delivery address.
    await page.goto('/men/topwear/jackets?inStock=1');
    await page.locator('main article').first().getByRole('heading').getByRole('link').click();
    await expect(page.getByPlaceholder('Enter pincode')).toHaveValue('560001');
    await page.getByRole('radiogroup', { name: 'Select size' }).getByRole('radio').and(page.locator(':not([disabled])')).first().click();
    await page.getByRole('button', { name: 'Add to Bag' }).click();
    await page.getByRole('link', { name: 'Go to Bag' }).click();
    const delivery = page.getByRole('region', { name: 'Delivery details' });
    await expect(delivery).toContainText('560001');
    await expect(delivery).toContainText(/Delivery by/);
    await delivery.getByRole('button', { name: 'Change' }).click();
    await page.getByRole('radio', { name: /First Home/ }).click();
    await expect(delivery).toContainText('110001');

    await page.goto('/account/addresses');
    await second.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog', { name: 'Delete this address?' }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'First Home' })).toContainText('Default');
  });

  test('addresses page passes axe', async ({ page }) => {
    await signUpViaApi(page);
    await page.goto('/account/addresses');
    await page.getByRole('button', { name: 'Add address' }).first().click();
    await fillAddress(page, { house: 'Axe Flat', pincode: '110001', city: 'New Delhi', state: 'Delhi' });
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
  });
});
