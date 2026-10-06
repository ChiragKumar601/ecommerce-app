import { expect, test } from '@playwright/test';

test('app shell loads and reaches the backend through the proxy', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Wardrobe & Co.' })).toBeVisible();
  await expect(page.getByTestId('backend-status')).toHaveText('Backend: ok');
});
