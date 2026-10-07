import { expect, test } from '@playwright/test';

test.describe('search on desktop (S8, UF-02)', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');
  test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1280, height: 900 }));
  const box = (page: import('@playwright/test').Page) => page.getByRole('combobox', { name: /Search for products/ });

  test('typo query → grouped suggestions → Enter shows results and remembers the term (SRC-001, SRC-004, SRC-009)', async ({ page }) => {
    await page.goto('/');
    await box(page).fill('snaekers');
    const list = page.getByRole('listbox', { name: 'Search suggestions' });
    await expect(list.getByRole('group', { name: 'Products' })).toBeVisible();
    await expect(list.getByRole('option').first()).toBeVisible();
    expect(await list.getByRole('option').count()).toBeLessThanOrEqual(8);
    await box(page).press('Enter');
    await expect(page).toHaveURL(/\/search\?q=snaekers$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Search: snaekers' })).toBeVisible();
    await expect(page.locator('main article').first()).toContainText(/sneaker/i);
    await expect(page).toHaveTitle('Search: snaekers – Wardrobe & Co.');
    // Recent search shows on empty focus, and can be cleared (SRC-002, SRC-009).
    await page.goto('/');
    await box(page).click();
    await expect(page.getByRole('group', { name: 'Recent searches' }).getByRole('option', { name: 'snaekers' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Popular searches' }).getByRole('option')).toHaveCount(5);
    await page.getByRole('button', { name: 'Clear recent searches' }).click();
    await expect(page.getByRole('group', { name: 'Recent searches' })).toHaveCount(0);
  });

  test('keyboard: arrow to a category suggestion and Enter opens that listing (SRC-005)', async ({ page }) => {
    await page.goto('/');
    await box(page).fill('kurt');
    const first = page.getByRole('group', { name: 'Categories' }).getByRole('option').first();
    await expect(first).toBeVisible();
    await box(page).press('ArrowDown');
    await expect(first).toHaveAttribute('aria-selected', 'true');
    await box(page).press('Enter');
    await expect(page).toHaveURL(/\/(men|women)\/[a-z-]+\/kurta/);
  });

  test('a product suggestion opens the product URL; Escape closes the list', async ({ page }) => {
    await page.goto('/shop/men');
    await box(page).fill('jeans');
    await expect(page.getByRole('listbox')).toBeVisible();
    await box(page).press('Escape');
    await expect(page.getByRole('listbox')).toBeHidden();
    await box(page).fill('jeans ');
    await page.getByRole('group', { name: 'Products' }).getByRole('option').first().click();
    await expect(page).toHaveURL(/\/p\/[a-z0-9-]+$/);
  });

  test('results support filters and chips like any listing (SRC-006)', async ({ page }) => {
    await page.goto('/search?q=shirt');
    const sidebar = page.getByRole('complementary', { name: 'Filters' });
    await sidebar.getByText('In-stock only').click();
    await expect(page).toHaveURL(/q=shirt.*inStock=1|inStock=1.*q=shirt/);
    await expect(page.getByRole('button', { name: 'Remove filter In-stock only' })).toBeVisible();
  });
});

test('zero results show the term, popular searches and the six sections (SRC-007)', async ({ page }) => {
  await page.goto('/search?q=zzqqxx');
  await expect(page.getByRole('heading', { level: 1, name: "No results for 'zzqqxx'" })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'sneakers', exact: true })).toHaveAttribute('href', '/search?q=sneakers');
  for (const s of ['Men', 'Women', 'Kids', 'Home', 'Beauty', 'Gen Z']) await expect(page.getByRole('main').getByRole('link', { name: s, exact: true })).toBeVisible();
});

test('empty query is ignored (SRC-010)', async ({ page }) => {
  await page.goto('/search?q=%20%20');
  await expect(page.getByRole('heading', { level: 1, name: 'What are you looking for?' })).toBeVisible();
});

test.describe('search on mobile (NAV-008)', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile only');
  test('overlay shows suggestions inline and submits', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const overlay = page.getByRole('dialog', { name: 'Search' });
    await overlay.getByRole('combobox').fill('lipstik');
    await expect(overlay.getByRole('group', { name: 'Products' }).getByRole('option').first()).toBeVisible();
    await overlay.getByRole('combobox').press('Enter');
    await expect(page).toHaveURL(/\/search\?q=lipstik/);
    await expect(overlay).toBeHidden();
    await expect(page.locator('main article').first()).toContainText(/lipstick/i);
  });
});
