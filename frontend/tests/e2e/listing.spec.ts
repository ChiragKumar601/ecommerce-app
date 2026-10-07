import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const cards = (page: Page) => page.locator('main article');
/** Waits until the grid shows final (not placeholder) results. */
const settled = (page: Page) => expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
const toBottom = (page: Page) => page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
const count = async (page: Page) => Number((await page.getByText(/^[\d,]+ items?$/).first().innerText()).replace(/[^\d]/g, ''));

test.describe('listings (S6)', () => {
  test('section listing: heading, count, cards linking to product pages, title (PLP-001, PLP-005, FE-007)', async ({ page }) => {
    await page.goto('/shop/men');
    await expect(page.getByRole('heading', { level: 1, name: 'Men' })).toBeVisible();
    expect(await count(page)).toBeGreaterThan(100);
    await expect(cards(page)).toHaveCount(24);
    await expect(cards(page).first().getByRole('link').first()).toHaveAttribute('href', /^\/p\/[a-z0-9-]+-[a-z0-9]{10}$/);
    await expect(page).toHaveTitle('Men – Shop – Wardrobe & Co.');
  });

  test('unknown catalogue slugs show Not found (GLB-005)', async ({ page }) => {
    await page.goto('/men/not-a-category');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });

  test('infinite scroll loads the next page and shows the end message (PLP-007)', async ({ page }) => {
    await page.goto('/men/topwear');
    const total = await count(page);
    await expect(cards(page)).toHaveCount(24);
    await toBottom(page);
    await expect(cards(page)).toHaveCount(Math.min(48, total));
    for (let i = 0; i < 5 && (await cards(page).count()) < total; i++) await toBottom(page);
    await expect(cards(page)).toHaveCount(total);
    await expect(page.getByText("You've seen all items")).toBeVisible();
  });

  test('Back from a product restores the results and scroll position (PLP-008)', async ({ page }) => {
    await page.goto('/men/topwear?sort=price_asc');
    await expect(cards(page)).toHaveCount(24);
    await toBottom(page);
    await expect(cards(page)).toHaveCount(48);
    const target = cards(page).nth(30);
    await target.scrollIntoViewIfNeeded();
    const name = await target.getByRole('heading').innerText();
    await target.getByRole('heading').getByRole('link').click();
    await expect(page).toHaveURL(/\/p\//);
    await page.goBack();
    await expect(page).toHaveURL(/\/men\/topwear\?sort=price_asc$/);
    await expect(cards(page).nth(30)).toBeInViewport();
    await expect(cards(page).nth(30).getByRole('heading')).toHaveText(name);
  });

  test('wishlist toggle works for guests and survives a reload (PLP-014)', async ({ page }) => {
    await page.goto('/shop/beauty');
    const toggle = cards(page).first().getByRole('button', { name: /wishlist/ });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(cards(page).first().getByRole('button', { name: /wishlist/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('has no critical accessibility violations', async ({ page }) => {
    await page.goto('/shop/women');
    await expect(cards(page).first()).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  });
});

test.describe('listing filters on desktop (PLP-002, PLP-006, PLP-009, PLP-010)', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');
  test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1280, height: 900 }));

  test('sidebar filter → URL, chip and count; chip removal and Clear all', async ({ page }) => {
    await page.goto('/men/topwear');
    const before = await count(page);
    const sidebar = page.getByRole('complementary', { name: 'Filters' });
    const brand = sidebar.locator('section', { has: page.getByRole('heading', { name: 'Brand' }) }).getByRole('checkbox').first();
    await brand.click();
    await expect(page).toHaveURL(/brand=/);
    const chips = page.getByLabel('Applied filters');
    await expect(chips.getByRole('button', { name: /^Remove filter/ })).toHaveCount(1);
    await expect.poll(() => count(page)).toBeLessThan(before);
    await sidebar.getByText('In-stock only').click();
    await expect(page).toHaveURL(/inStock=1/);
    await expect(chips.getByRole('button', { name: /^Remove filter/ })).toHaveCount(2);
    await chips.getByRole('button', { name: 'Remove filter In-stock only' }).click();
    await expect(page).not.toHaveURL(/inStock/);
    await chips.getByRole('button', { name: 'Clear all' }).click();
    await expect(page).not.toHaveURL(/brand=/);
    await expect.poll(() => count(page)).toBe(before);
  });

  test('sort updates the URL and orders by price (PLP-003)', async ({ page }) => {
    await page.goto('/shop/home');
    await page.getByRole('combobox', { name: 'Sort by' }).selectOption('price_asc');
    await expect(page).toHaveURL(/sort=price_asc/);
    const firstTen = async () => {
      const prices = await cards(page).locator('p.tabular span.font-bold').allInnerTexts();
      return prices.slice(0, 10).map((p) => Number(p.replace(/[^\d]/g, '')));
    };
    await expect.poll(async () => {
      const v = await firstTen();
      return v.every((x, i) => i === 0 || v[i - 1]! <= x);
    }).toBe(true);
    await settled(page);
  });

  test('filters carry over within a section and reset across sections (PLP-009)', async ({ page }) => {
    await page.goto('/men/topwear?inStock=1&sort=price_desc');
    await expect(cards(page).first()).toBeVisible();
    await page.getByRole('button', { name: 'Men', exact: true }).hover();
    await page.getByRole('link', { name: 'Bottomwear' }).click();
    await expect(page).toHaveURL(/\/men\/bottomwear\?inStock=1&sort=price_desc$/);
    await expect(page.getByLabel('Applied filters').getByText('In-stock only')).toBeVisible();
    await page.getByRole('button', { name: 'Women', exact: true }).hover();
    await page.getByRole('link', { name: 'Shop all Women' }).click();
    await expect(page).toHaveURL(/\/shop\/women$/);
  });

  test('bank-offer listing shows its eligibility chip, removable (LND-004)', async ({ page }) => {
    await page.goto('/offers/hdfc');
    await expect(page.getByRole('heading', { level: 1, name: 'HDFC Bank Offer' })).toBeVisible();
    const eligible = await count(page);
    await page.getByRole('button', { name: 'Remove filter HDFC Bank offer' }).click();
    await expect(page).toHaveURL(/bankOffer=0/);
    await expect.poll(() => count(page)).toBeGreaterThan(eligible);
  });
});

test.describe('listing on mobile (PLP-010)', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile only');

  test('Filter and Sort open bottom sheets that apply on Apply', async ({ page }) => {
    await page.goto('/shop/kids');
    const before = await count(page);
    await page.getByRole('button', { name: /^Filter/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    await sheet.getByRole('checkbox').first().click();
    await expect(page).not.toHaveURL(/category=/); // staged until Apply
    await sheet.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page).toHaveURL(/category=/);
    await expect.poll(() => count(page)).toBeLessThan(before);
    await page.getByRole('button', { name: /^Sort/ }).click();
    const sortSheet = page.getByRole('dialog', { name: 'Sort by' });
    await sortSheet.getByText("What's New").click();
    await sortSheet.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page).toHaveURL(/sort=new/);
    await expect(page.getByRole('button', { name: /^Sort: What's New/ })).toBeVisible();
  });
});
