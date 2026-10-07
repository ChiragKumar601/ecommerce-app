import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { signUpViaApi } from './helpers';

// Live Mapbox check (ADDR-001): runs only when a token is configured for the build, and needs network access.
const envFile = new URL('../../.env.local', import.meta.url);
const HAS_TOKEN = existsSync(envFile) && /VITE_MAPBOX_TOKEN=pk\./.test(readFileSync(envFile, 'utf8'));
test.skip(!HAS_TOKEN, 'no Mapbox token in frontend/.env.local');

test.use({ geolocation: { latitude: 12.9716, longitude: 77.5946 }, permissions: ['geolocation'] });

test('map step: place search, draggable pin with reverse-geocode prefill, static preview, current location (ADDR-001, ADDR-002, ADDR-005)', async ({ page }) => {
  test.setTimeout(90_000);
  await signUpViaApi(page);
  await page.goto('/account/addresses');
  await page.getByRole('button', { name: 'Add address' }).first().click();
  const d = page.getByRole('dialog', { name: 'Add a new address' });
  await expect(d.locator('.mapboxgl-canvas')).toBeVisible({ timeout: 15_000 });
  await expect(d.getByRole('status', { name: 'Loading map' })).toBeHidden({ timeout: 15_000 });
  await expect(d.getByRole('button', { name: 'Enter address manually' })).toBeVisible();

  await d.getByLabel('Search for a place').fill('MG Road Bengaluru');
  await d.getByRole('button', { name: 'Search' }).click();
  const result = d.locator('ul button').first();
  await expect(result).toBeVisible({ timeout: 10_000 });
  await result.click();
  await expect(d.getByRole('button', { name: 'Confirm location' })).toBeEnabled({ timeout: 10_000 });
  await page.waitForTimeout(2500);
  // Drag the pin a little: it reverse-geocodes again.
  const before = await d.locator('p', { hasText: 'Bengaluru' }).last().innerText();
  const pin = d.locator('.mapboxgl-marker');
  const box = (await pin.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height + 60, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => d.locator('p', { hasText: 'Bengaluru' }).last().innerText(), { timeout: 10_000 }).not.toBe(before);
  await d.getByRole('button', { name: 'Confirm location' }).click();

  await expect(d.getByLabel('City')).not.toHaveValue('');
  const preview = d.getByRole('img', { name: 'Map showing the chosen location' });
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate((i: HTMLImageElement) => i.naturalWidth), { timeout: 10_000 }).toBeGreaterThan(0);

  await d.getByLabel('Recipient phone').fill('9876543210');
  await d.getByLabel('House / flat').fill('12A');
  if (!(await d.getByLabel('Pincode').inputValue())) await d.getByLabel('Pincode').fill('560001');
  if (!(await d.getByLabel('State').inputValue())) await d.getByLabel('State').selectOption('Karnataka');
  if (!(await d.getByLabel('Street / area').inputValue())) await d.getByLabel('Street / area').fill('MG Road');
  await d.getByRole('button', { name: 'Save address' }).click();
  await expect(d).toBeHidden();
  const card = page.getByRole('listitem').filter({ hasText: '12A' });
  await expect(card).toBeVisible();

  // Edit reopens the map at the saved pin; "Use my current location" moves it.
  await card.getByRole('button', { name: 'Edit' }).click();
  const e = page.getByRole('dialog', { name: 'Edit address' });
  await expect(e.getByRole('status', { name: 'Loading map' })).toBeHidden({ timeout: 15_000 });
  const saved = e.locator('p', { hasText: 'Bengaluru' }).last();
  await expect(saved).toBeVisible({ timeout: 10_000 });
  const was = await saved.innerText();
  await e.getByRole('button', { name: 'Use my current location' }).click();
  await expect.poll(() => saved.innerText(), { timeout: 10_000 }).not.toBe(was);
});
