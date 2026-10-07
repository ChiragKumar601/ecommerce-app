import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signUpViaApi } from './helpers';

test.describe('account sections (S12)', () => {
  test('profile home lists every section; edit profile needs the current password for a phone change (PRF-001, PRF-002)', async ({ page }) => {
    await signUpViaApi(page);
    await page.goto('/account');
    const nav = page.getByRole('navigation', { name: 'Account sections' });
    for (const name of ['Orders', 'Wishlist', 'Gift Cards', 'Credits', 'Saved Cards', 'Saved Addresses', 'Contact Us', 'Log out']) {
      await expect(nav.getByText(name, { exact: true })).toBeVisible();
    }
    await page.getByRole('link', { name: 'Edit Profile' }).click();
    const phone = `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
    await page.getByLabel('Mobile number').fill(phone);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Enter your current password to save these changes')).toBeVisible();
    await page.getByLabel(/Current password/).fill('secret123');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Profile updated', { exact: true })).toBeVisible();
    await page.goto('/account');
    await expect(page.getByText(new RegExp(`\\+91${phone}`))).toBeVisible();
  });

  test('credits show the sign-up grant; gift card redeem and errors (PRF-003, PRF-004)', async ({ page }) => {
    await signUpViaApi(page);
    await page.goto('/account/credits');
    await expect(page.getByText('Available balance')).toBeVisible();
    await expect(page.getByText('₹500').first()).toBeVisible();
    await expect(page.getByText('Welcome credits')).toBeVisible();

    await page.goto('/account/gift-cards');
    await page.getByLabel('Gift card code').fill('demogift2000');
    await page.getByRole('button', { name: 'Redeem' }).click();
    await expect(page.getByText('Gift card •••• 2000 added: ₹2,000')).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: '•••• 2000' })).toContainText('Active');
    await page.getByLabel('Gift card code').fill('DEMOGIFT2000');
    await page.getByRole('button', { name: 'Redeem' }).click();
    await expect(page.getByRole('alert').filter({ hasText: "You've already redeemed this gift card" })).toBeVisible();
  });

  test('saved cards: real numbers refused, test card saved as default, remove with confirmation (PRF-005)', async ({ page }) => {
    await signUpViaApi(page);
    await page.goto('/account/cards');
    await page.getByRole('button', { name: 'Add card' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add a card' });
    await expect(dialog.getByText('This is a demo — do not enter real card details.')).toBeVisible();
    await dialog.getByLabel('Card number').fill('4111111111111111');
    await dialog.getByLabel('Name on card').fill('Test Shopper');
    await dialog.getByLabel(/Expiry/).fill('1230');
    await dialog.getByLabel('CVV').fill('123');
    await dialog.getByRole('button', { name: 'Save card' }).click();
    await expect(dialog.getByText("Use a demo test card. Real cards aren't accepted. See Demo help.")).toBeVisible();
    await expect(dialog.getByLabel('CVV')).toHaveValue('');
    await dialog.getByLabel('Card number').fill('4000000110000009');
    await dialog.getByLabel('CVV').fill('123');
    await dialog.getByRole('button', { name: 'Save card' }).click();
    await expect(dialog).toBeHidden();
    const card = page.getByRole('listitem').filter({ hasText: 'Visa •••• 0009' });
    await expect(card).toContainText('Default');
    await card.getByRole('button', { name: /Remove/ }).click();
    await page.getByRole('dialog', { name: 'Remove this card?' }).getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText('No saved cards')).toBeVisible();
  });

  test('contact us: FAQs, request submitted with a number, deletion message (PRF-006)', async ({ page }) => {
    await signUpViaApi(page);
    await page.goto('/account/support');
    await expect(page.getByRole('heading', { name: 'Frequently asked questions' })).toBeVisible();
    await page.getByLabel('Request type').selectOption('payment');
    await page.getByLabel(/^Message/).fill('My payment shows as pending.');
    await page.getByRole('button', { name: 'Submit request' }).click();
    await expect(page.getByText(/^Request SR-\d{6}-[A-Z0-9]{5} submitted$/)).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: /SR-.* · Payment/ })).toContainText('Submitted');
    await page.getByLabel('Request type').selectOption('account_deletion');
    await page.getByLabel(/^Message/).fill('Please delete my account and data.');
    await page.getByRole('button', { name: 'Submit request' }).click();
    await expect(page.getByText("We've recorded your request. Your account and personal data will be deleted within 30 days.")).toBeVisible();
  });

  test('demo help lists test values and image credits; account pages pass axe', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/demo-help');
    await expect(page.getByRole('heading', { level: 1, name: 'Demo help' })).toBeVisible();
    await expect(page.getByText('success@demo')).toBeVisible();
    await expect(page.getByText('#pickupfail')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Image credits' })).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
    await signUpViaApi(page);
    for (const path of ['/account', '/account/profile', '/account/credits', '/account/gift-cards', '/account/cards', '/account/support']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(r.violations, path).toEqual([]);
    }
  });
});
