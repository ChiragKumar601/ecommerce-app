import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('desktop navigation (NAV-001…NAV-008)', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto('/');
  });

  test('header shows the logo, six sections and labelled icons', async ({ page }) => {
    const sections = page.getByRole('navigation', { name: 'Shop by section' });
    for (const name of ['Men', 'Women', 'Kids', 'Home', 'Beauty', 'Gen Z']) await expect(sections.getByRole('button', { name, exact: true })).toBeVisible();
    for (const name of ['Profile', 'Wishlist', 'Bag']) await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: /Search for products/ })).toBeVisible();
  });

  test('mega menu opens on hover with categories and subcategories (NAV-005)', async ({ page }) => {
    await page.getByRole('button', { name: 'Men', exact: true }).hover();
    await expect(page.getByRole('link', { name: 'Topwear' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'T-Shirts', exact: true })).toHaveAttribute('href', '/men/topwear/t-shirts');
    await expect(page.getByRole('link', { name: 'Shop all Men' })).toHaveAttribute('href', '/shop/men');
  });

  test('mega menu works by keyboard and closes on Escape (NAV-005, FE-004)', async ({ page }) => {
    await page.getByRole('button', { name: 'Kids' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('link', { name: 'Shop all Kids' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('link', { name: 'Shop all Kids' })).toBeHidden();
  });

  test('the logo returns to the landing page and Enter in search goes to /search (NAV-001, SRC-005)', async ({ page }) => {
    await page.goto('/pages/blog');
    await page.getByRole('link', { name: /Wardrobe & Co\. — home/ }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.getByRole('combobox', { name: /Search for products/ }).fill('sneakers');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/search\?q=sneakers$/);
  });
});

test.describe('mobile navigation (NAV-006, NAV-008)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
  });

  test('drawer shows section → category → subcategory, traps focus and returns it', async ({ page }) => {
    const opener = page.getByRole('button', { name: 'Open menu' });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Menu' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Women' }).click();
    await dialog.getByRole('button', { name: 'Dresses' }).click();
    await expect(dialog.getByRole('link', { name: 'Maxi Dresses' })).toHaveAttribute('href', '/women/dresses/maxi-dresses');
    for (let i = 0; i < 40; i += 1) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('search icon opens a full-screen search overlay', async ({ page }) => {
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const overlay = page.getByRole('dialog', { name: 'Search' });
    await expect(overlay.getByRole('combobox')).toBeFocused();
    await overlay.getByRole('combobox').fill('kurta');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/search\?q=kurta$/);
  });

  test('the logo stays on one line at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const logo = page.getByRole('link', { name: /Wardrobe & Co\. — home/ });
    const box = await logo.boundingBox();
    expect(box!.height).toBeLessThan(36);
  });
});

test.describe('footer and content pages (LND-007, LND-008)', () => {
  test('footer blocks appear in the specified order', async ({ page }) => {
    await page.goto('/');
    const footer = page.getByRole('contentinfo', { name: 'Footer' });
    await expect(footer.getByText('100% ORIGINAL')).toBeVisible(); // wait for site content
    const headings = await footer.getByRole('heading').allInnerTexts();
    const order = ['USEFUL LINKS', 'POLICIES', 'POPULAR SEARCHES', 'REGISTERED OFFICE', 'How we make shopping easy'];
    const positions = order.map((h) => headings.findIndex((x) => x.toUpperCase().startsWith(h.toUpperCase())));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    await expect(footer.getByText('100% ORIGINAL')).toBeVisible();
    await expect(footer.getByText('Easy 14-day returns on eligible items')).toBeVisible();
    await expect(footer.getByRole('link', { name: 'kurta sets' })).toHaveAttribute('href', '/search?q=kurta%20sets');
    await expect(footer.getByText(/CIN: .*sample/)).toBeVisible();
  });

  test('policy pages are labelled as placeholder and titled', async ({ page }) => {
    await page.goto('/pages/privacy-policy');
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible();
    await expect(page.getByText('Placeholder content')).toBeVisible();
    await expect(page.getByText(/30 days of inactivity/)).toBeVisible();
    await expect(page).toHaveTitle('Privacy Policy – Wardrobe & Co.');
  });

  test('unknown content pages show Not found', async ({ page }) => {
    await page.goto('/pages/does-not-exist');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });

  test('header, menu and footer have no detectable accessibility violations', async ({ page }) => {
    await page.goto('/pages/terms-of-use');
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  });
});
