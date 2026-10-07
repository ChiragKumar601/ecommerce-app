import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PASSWORD, signUpViaApi } from './helpers';

/** Opens the first in-stock product of a listing and returns its name. */
async function openProduct(page: Page, listing = '/men/topwear/jackets') {
  await page.goto(`${listing}?inStock=1`);
  const card = page.locator('main article').first();
  const name = await card.getByRole('heading').innerText();
  await card.getByRole('heading').getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  return name;
}

async function pickSize(page: Page) {
  await page.getByRole('radiogroup', { name: 'Select size' }).getByRole('radio').and(page.locator(':not([disabled])')).first().click();
}

const bagBadge = (page: Page) => page.getByRole('link', { name: /^Bag/ });

test.describe('bag and wishlist (S11)', () => {
  test('UF-01: listing → product → size required → Add to Bag → badge → Go to Bag (PDP-004, PDP-008, NAV-004)', async ({ page }) => {
    await page.goto('/');
    await page.locator('main a[href^="/"]').filter({ hasText: /Shop Now/i }).first().click();
    await expect(page.locator('main article').first()).toBeVisible();
    const name = await openProduct(page);
    await page.getByRole('button', { name: 'Add to Bag' }).click();
    await expect(page.getByText('Please select a size')).toBeVisible();
    await pickSize(page);
    await page.getByRole('button', { name: 'Add to Bag' }).click();
    await expect(bagBadge(page)).toHaveAccessibleName('Bag, 1 item');
    await page.getByRole('link', { name: 'Go to Bag' }).click();
    await expect(page).toHaveURL(/\/bag$/);
    await expect(page.getByRole('list', { name: 'Items in your bag' }).getByRole('listitem')).toHaveCount(1);
    await expect(page.getByRole('list', { name: 'Items in your bag' }).getByRole('listitem').first()).toContainText(name);
    await expect(page.getByRole('region', { name: 'Price summary' })).toContainText('Total amount');
    await expect(page.getByRole('region', { name: 'Price summary' })).toContainText(/Inclusive of ₹[\d,.]+ tax/);
  });

  test('bag: quantity, remove with Undo, coupon errors and apply, empty state (BAG-002, BAG-003, BAG-006, BAG-012)', async ({ page }) => {
    await openProduct(page, '/men/topwear/jackets');
    await pickSize(page);
    await page.getByRole('button', { name: 'Add to Bag' }).click();
    await expect(bagBadge(page)).toHaveAccessibleName('Bag, 1 item');
    await page.goto('/bag');
    const qty = page.getByLabel(/^Quantity for/);
    await qty.selectOption('2');
    await expect(bagBadge(page)).toHaveAccessibleName('Bag, 2 items');

    await page.getByPlaceholder('Enter coupon code').fill('NOPE99');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByRole('alert').filter({ hasText: "This coupon code isn't valid." })).toBeVisible();
    await page.getByRole('button', { name: 'View available coupons' }).click();
    const dialog = page.getByRole('dialog', { name: 'Available coupons' });
    await expect(dialog.getByText('BEAUTY15')).toBeVisible();
    const eligible = dialog.getByRole('listitem').filter({ has: page.locator('button:not([disabled])') }).first();
    const code = (await eligible.locator('p').first().innerText()).trim();
    await eligible.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByText(new RegExp(`^${code} applied`))).toBeVisible();
    await expect(page.getByRole('region', { name: 'Price summary' })).toContainText('Coupon discount');

    await page.getByRole('button', { name: /^Remove .+ from bag$/ }).click();
    await expect(page.getByText('Removed from bag', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(bagBadge(page)).toHaveAccessibleName('Bag, 2 items');
    await page.getByRole('button', { name: /^Remove .+ from bag$/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Your bag is empty' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continue Shopping' })).toHaveAttribute('href', '/');
  });

  test('wishlist: guest add, page, move to bag with a size picker; empty state (WSH-001…003)', async ({ page }) => {
    const name = await openProduct(page);
    await page.getByRole('button', { name: 'Wishlist', exact: true }).click();
    await page.goto('/wishlist');
    await expect(page.getByRole('heading', { level: 1, name: 'Wishlist' })).toBeVisible();
    const card = page.getByRole('article', { name });
    await card.getByRole('button', { name: 'Move to Bag' }).click();
    const picker = page.getByRole('dialog', { name: 'Select size' });
    // Several sizes in stock → a size picker; a single one moves straight away.
    await expect(picker.or(page.getByText('Moved to bag', { exact: true }))).toBeVisible();
    if (await picker.isVisible()) {
      await picker.getByRole('radio').first().click();
      await picker.getByRole('button', { name: 'Move to Bag' }).click();
    }
    await expect(bagBadge(page)).toHaveAccessibleName('Bag, 1 item');
    await expect(page.getByRole('heading', { level: 1, name: 'Your wishlist is empty' })).toBeVisible();
  });

  test('UF-03: guest bag → Proceed to Checkout → login prompt → log in → bags merge (AUTH-012, AUTH-020)', async ({ page, context }) => {
    const { email } = await signUpViaApi(page);
    await context.clearCookies();
    await openProduct(page);
    await pickSize(page);
    await page.getByRole('button', { name: 'Add to Bag' }).click();
    await expect(bagBadge(page)).toHaveAccessibleName('Bag, 1 item');
    await page.goto('/bag');
    await page.getByRole('button', { name: 'Proceed to Checkout' }).click();
    const prompt = page.getByRole('dialog', { name: 'Log in to check out' });
    await expect(prompt).toBeVisible();
    await prompt.getByRole('button', { name: 'Log in' }).click();
    await page.getByLabel(/Email or mobile number/).fill(email);
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/checkout/);
    // The guest line now lives on the account, and the device bag is cleared.
    await page.goto('/bag');
    await expect(page.getByRole('list', { name: 'Items in your bag' }).getByRole('listitem')).toHaveCount(1);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('wco.device.v1') ?? '{}').bag)).toEqual([]);
  });

  test('bag page passes axe', async ({ page }) => {
    await openProduct(page);
    await pickSize(page);
    await page.getByRole('button', { name: 'Add to Bag' }).click();
    await expect(bagBadge(page)).toHaveAccessibleName('Bag, 1 item');
    await page.goto('/bag');
    await expect(page.getByRole('region', { name: 'Price summary' })).toBeVisible();
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(r.violations).toEqual([]);
  });
});
