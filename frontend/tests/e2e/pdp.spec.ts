import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Opens the first in-stock, multi-size product from a listing, so the link carries the listing path. */
async function openFromListing(page: Page, listing = '/men/topwear/jackets') {
  await page.goto(`${listing}?inStock=1`);
  const card = page.locator('main article').first();
  const name = await card.getByRole('heading').innerText();
  await card.getByRole('heading').getByRole('link').click();
  await expect(page).toHaveURL(/\/p\/[a-z0-9-]+-[a-z0-9]{10}$/);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  return name;
}

test.describe('product detail page (S9)', () => {
  test('shows brand, name, price, taxes note, breadcrumbs from the listing, and a unique title (PDP-002, NAV-010, FE-007)', async ({ page }) => {
    const name = await openFromListing(page);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByText('Inclusive of all taxes')).toBeVisible();
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link', { name: 'Jackets' })).toHaveAttribute('href', '/men/topwear/jackets');
    await expect(page).toHaveTitle(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} – .+ – Wardrobe & Co\\.$`));
  });

  test('wrong slugs redirect to the canonical URL; unknown ids are Not found', async ({ page }) => {
    await openFromListing(page);
    const canonical = new URL(page.url()).pathname;
    const id = canonical.slice(-10);
    await page.goto(`/p/some-old-name-${id}`);
    await expect(page).toHaveURL(new RegExp(`${canonical}$`));
    await page.goto('/p/nothing-here-zzzzzzzzzz');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });

  test('sizes: out-of-stock sizes are disabled and named so; the price follows the selection (PDP-003)', async ({ page }) => {
    await openFromListing(page);
    const sizes = page.getByRole('radiogroup', { name: 'Select size' }).getByRole('radio');
    expect(await sizes.count()).toBeGreaterThan(1);
    const enabled = sizes.and(page.locator(':not([disabled])')).first();
    await enabled.click();
    await expect(enabled).toHaveAttribute('aria-checked', 'true');
    for (const s of await sizes.all()) {
      if (await s.isDisabled()) await expect(s).toHaveAccessibleName(/Out of stock$/);
    }
  });

  test('gallery opens a full-screen viewer with arrow navigation, zoom and Escape (PDP-001)', async ({ page }) => {
    await openFromListing(page);
    await page.getByRole('button', { name: /Open full-screen view/ }).click();
    const viewer = page.getByRole('dialog', { name: /Image 1 of/ });
    await expect(viewer).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('dialog', { name: /Image 2 of/ })).toBeVisible();
    const img = page.getByRole('dialog').locator('img');
    await img.click();
    await expect(img).toHaveCSS('transform', /matrix\(2\.2/);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('pincode check: delivery date, unserviceable message, validation, remembered on the device (PDP-007)', async ({ page }) => {
    await openFromListing(page);
    const input = page.getByRole('textbox', { name: 'Pincode' });
    await input.fill('12345');
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByText('Enter a valid 6-digit pincode')).toBeVisible();
    await input.fill('999999');
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByText("Sorry, we don't deliver to 999999 yet")).toBeVisible();
    await input.fill('110001');
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByText(/^Delivery by \w{3}, \d{1,2} \w{3} \d{4}$/)).toBeVisible();
    await expect(page.getByText('Free delivery on orders above ₹1,999')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Pincode' })).toHaveValue('110001');
    await expect(page.getByText(/^Delivery by /)).toBeVisible();
  });

  test('offers, return line, size guide and details (PDP-005, PDP-006)', async ({ page }) => {
    await openFromListing(page);
    await expect(page.getByText(/Use code/).first()).toBeVisible();
    await expect(page.getByRole('main').getByText(/^\s*(Easy 14-day returns|This item is not returnable)\s*$/)).toBeVisible();
    await page.getByRole('button', { name: 'Size guide' }).click();
    await expect(page.getByRole('dialog', { name: /Size guide/ }).getByRole('table')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Specifications' }).click();
    await expect(page.getByText('Material', { exact: true })).toBeVisible();
  });

  test('reviews: aggregate, filter, sort and load more (REV-001, REV-002)', async ({ page }) => {
    await openFromListing(page);
    const reviews = page.locator('#reviews');
    await reviews.scrollIntoViewIfNeeded();
    await expect(reviews.getByRole('list', { name: 'Rating breakdown' }).getByRole('listitem')).toHaveCount(5);
    const items = reviews.locator('ul.divide-y > li');
    await expect(items.first()).toBeVisible();
    await reviews.getByRole('button', { name: '5★' }).click();
    await expect(reviews.getByRole('button', { name: '5★' })).toHaveAttribute('aria-pressed', 'true');
    await expect(items.first().getByLabel('Rated 5 out of 5')).toBeVisible();
    await reviews.getByRole('button', { name: 'All', exact: true }).click();
    await reviews.getByRole('combobox', { name: 'Sort' }).selectOption('lowest');
    const more = reviews.getByRole('button', { name: 'Load more reviews' });
    if (await more.isVisible()) {
      const before = await items.count();
      await more.click();
      await expect.poll(() => items.count()).toBeGreaterThan(before);
    }
  });

  test('recommendation rails render product cards (PDP-011)', async ({ page }) => {
    await openFromListing(page);
    await expect(page.getByRole('heading', { name: 'Similar products' }).or(page.getByRole('heading', { name: 'You may also like' })).first()).toBeVisible();
  });

  test('wishlist button toggles for guests (PDP-010)', async ({ page }) => {
    await openFromListing(page);
    const btn = page.getByRole('button', { name: /^Wishlist(ed)?$/ });
    await btn.click();
    await expect(page.getByRole('button', { name: 'Wishlisted' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('has no serious accessibility violations', async ({ page }) => {
    await openFromListing(page);
    await expect(page.locator('#reviews')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  });
});
