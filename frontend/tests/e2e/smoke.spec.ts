import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('the app shell shows the demo banner (GLB-001)', async ({ page }) => {
  await page.goto('/');
  const banner = page.getByRole('note', { name: 'Demo notice' });
  await expect(banner).toHaveText(/Demo store — for showcase only/);
  await expect(page.getByRole('link', { name: /Wardrobe & Co\. — home/ })).toBeVisible();
  await expect(page).toHaveTitle(/Wardrobe & Co\./);
});

for (const width of [360, 768, 1024, 1280]) {
  test(`no horizontal scroll and banner visible at ${width}px (FE-001)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await expect(page.getByRole('note', { name: 'Demo notice' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('unknown routes show Page not found with search and a home link (GLB-005)', async ({ page }) => {
  await page.goto('/this/page/does-not-exist/at-all');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('search')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/');
  await expect(page).toHaveTitle('Page not found – Wardrobe & Co.');
});

test('the shell has no automatically detectable accessibility violations (FE-004)', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
