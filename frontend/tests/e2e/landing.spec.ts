import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('landing page (S7)', () => {
  test('sections appear in LND-001 order', async ({ page }) => {
    await page.goto('/');
    const carousel = page.getByRole('region', { name: 'Featured collections' });
    const offer = page.getByRole('heading', { name: /HDFC Bank credit and debit cards/ });
    const grid = page.getByRole('heading', { name: 'Shop by Category' });
    await expect(carousel).toBeVisible();
    const y = async (l: typeof carousel) => (await l.boundingBox())!.y;
    expect(await y(carousel)).toBeLessThan(await y(offer));
    expect(await y(offer)).toBeLessThan(await y(grid));
    expect(await y(grid)).toBeLessThan(await y(page.getByRole('contentinfo')));
  });

  test('carousel: Next/Previous, Pause stops autoplay, a slide links to Best Sellers (LND-002, LND-003)', async ({ page }) => {
    await page.goto('/');
    const carousel = page.getByRole('region', { name: 'Featured collections' });
    const current = carousel.locator('[aria-roledescription="slide"]:not([aria-hidden="true"])');
    await expect(current).toHaveAttribute('aria-label', /^1 of /);
    await carousel.getByRole('button', { name: 'Next slide' }).click();
    await expect(current).toHaveAttribute('aria-label', /^2 of /);
    await carousel.getByRole('button', { name: 'Previous slide' }).click();
    await expect(current).toHaveAttribute('aria-label', /^1 of /);
    // Focus inside pauses; move focus out and let autoplay advance (5 s).
    await page.mouse.move(0, 0);
    await page.locator('body').click({ position: { x: 1, y: 1 } }).catch(() => undefined);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(current).toHaveAttribute('aria-label', /^2 of /, { timeout: 8000 });
    await carousel.getByRole('button', { name: 'Pause slideshow' }).click();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.mouse.move(0, 0);
    const label = await current.getAttribute('aria-label');
    await page.waitForTimeout(6000);
    await expect(current).toHaveAttribute('aria-label', label!);
    await expect(carousel.getByRole('button', { name: 'Play slideshow' })).toBeVisible();
    await expect(carousel.locator('a[href="/collections/best-seller-styles"]')).toHaveCount(1);
  });

  test('bank-offer tile opens its terms and the offer listing (LND-004)', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'T&C apply' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('10%');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.getByRole('link', { name: /HDFC Bank credit and debit cards/ }).click();
    await expect(page).toHaveURL(/\/offers\/hdfc$/);
    await expect(page.getByRole('button', { name: 'Remove filter HDFC Bank offer' })).toBeVisible();
  });

  test('Shop by Category: whole card navigates; 3:4 images (LND-005, LND-006)', async ({ page }) => {
    await page.goto('/');
    const card = page.getByRole('link', { name: /Ethnic Wear 50–80% OFF Shop Now/ });
    const img = card.locator('img');
    const box = (await img.boundingBox())!;
    expect(box.height / box.width).toBeCloseTo(4 / 3, 1);
    await card.click();
    await expect(page).toHaveURL(/\/shop\/all\?nodes=women%2Findian-wear%2Cmen%2Ftraditional-wear|\/shop\/all\?nodes=women\/indian-wear,men\/traditional-wear/);
    await expect(page.getByRole('heading', { level: 1, name: 'Indian Wear, Traditional Wear' })).toBeVisible();
  });

  for (const [width, cols] of [[1280, 6], [1024, 5], [768, 4], [390, 2]] as const) {
    test(`category grid has ${cols} columns at ${width}px (LND-006)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const items = page.locator('#shop-by-category-title ~ ul > li, section[aria-labelledby="shop-by-category-title"] ul > li');
      await expect(items.first()).toBeVisible();
      const tops = await items.evaluateAll((els) => els.slice(0, 8).map((e) => Math.round(e.getBoundingClientRect().top)));
      expect(tops.filter((t) => t === tops[0]).length).toBe(cols);
    });
  }

  test('has no serious accessibility violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Shop by Category' })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  });
});
