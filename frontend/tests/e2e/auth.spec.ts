import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { PASSWORD, signUpViaApi, uniqueEmail } from './helpers';

test.describe('accounts and authentication (S10)', () => {
  test('sign-up validates on blur and submit, then logs in (AUTH-001, AUTH-003, AUTH-016)', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible();
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Enter your name (2–60 letters)')).toBeVisible();
    await expect(page.getByText('You must be 18 or older to create an account')).toBeVisible();
    await expect(page.getByLabel(/Full name/)).toBeFocused();

    await page.getByLabel(/Full name/).fill('Asha Kumar');
    await page.getByLabel(/^Email/).fill(uniqueEmail('signup'));
    await page.getByLabel(/^Password/).fill('short');
    await page.getByLabel(/^Password/).blur();
    await expect(page.getByText('Use 8–64 characters with at least one letter and one number')).toBeVisible();
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByLabel(/Confirm password/).fill(PASSWORD);
    await page.getByLabel(/Security question/).selectOption({ index: 1 });
    await page.getByLabel(/Your answer/).fill('Blue Moon');
    await page.getByRole('checkbox', { name: 'I am 18 or older' }).click();
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/account');
    await expect(page.getByRole('heading', { level: 1, name: 'Asha Kumar' })).toBeVisible();
  });

  test('protected route → login → back to the route; wrong password message; logout confirmation (AUTH-005, AUTH-013, AUTH-015)', async ({ page, context }) => {
    const { email } = await signUpViaApi(page);
    await context.clearCookies();
    await page.goto('/account');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Faccount$/);
    await page.getByLabel(/Email or mobile number/).fill(email);
    await page.getByLabel(/^Password/).fill('wrongpass1');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Incorrect email/phone or password.' })).toBeVisible();
    await expect(page.getByLabel(/^Password/)).toHaveValue('');
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Test Shopper' })).toBeVisible();

    await page.getByRole('button', { name: 'Log out' }).click();
    const dialog = page.getByRole('dialog', { name: 'Log out?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/account');
    await expect(page).toHaveURL(/\/login/);
  });

  test('password reset with the question chosen from the list; notice at the next login (UF-13)', async ({ page, context }) => {
    const { email } = await signUpViaApi(page);
    await context.clearCookies();
    await page.goto('/forgot-password');
    await page.getByLabel(/Email or mobile number/).fill(email);
    // A wrong question is indistinguishable from a wrong answer (AUTH-008).
    await page.getByLabel(/Your security question/).selectOption({ index: 2 });
    await page.getByLabel(/Your answer/).fill('blue moon');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('alert').filter({ hasText: "The details you entered don't match our records." })).toBeVisible();
    await page.getByLabel(/Your security question/).selectOption({ index: 1 });
    await page.getByLabel(/Your answer/).fill('  BLUE   moon ');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel(/^New password/).fill('newpass456');
    await page.getByLabel(/Confirm new password/).fill('newpass456');
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page.getByRole('heading', { name: 'Password updated' })).toBeVisible();
    await page.getByRole('link', { name: 'Log in' }).click();
    await page.getByLabel(/Email or mobile number/).fill(email);
    await page.getByLabel(/^Password/).fill('newpass456');
    await page.getByRole('button', { name: 'Log in' }).click();
    const notice = page.getByRole('dialog', { name: 'Your password was changed' });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/Your password was changed on .+\. If this wasn't you, reset it now\./);
  });

  test('auth pages pass axe', async ({ page }) => {
    for (const path of ['/login', '/signup', '/forgot-password']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(r.violations, path).toEqual([]);
    }
  });
});
