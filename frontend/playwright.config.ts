import { defineConfig, devices } from '@playwright/test';

const BACKEND_PORT = 4100;
// WebKit needs host system libraries. It always runs in CI (installed with --with-deps); locally it
// runs only when PW_WEBKIT=1, because the owner chose to skip the WebKit host install for now.
const RUN_WEBKIT = !!process.env['CI'] || process.env['PW_WEBKIT'] === '1';
const FRONTEND_PORT = 4173;
const E2E_DB = 'file:./data/e2e.db';

// E2E setup (plan §10): Playwright starts its own backend, worker and frontend preview build
// on dedicated ports, so tests never touch the developer's running servers.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: `http://localhost:${FRONTEND_PORT}`, trace: 'on-first-retry' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    ...(RUN_WEBKIT ? [{ name: 'webkit', use: { ...devices['Desktop Safari'] } }] : []),
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    {
      // Own database: a fresh snapshot of the dev catalogue without accounts (prepare-e2e-db).
      command: `pnpm --dir ../backend exec tsx src/scripts/prepare-e2e-db.ts && pnpm --dir ../backend exec tsx src/server.ts`,
      url: `http://localhost:${BACKEND_PORT}/api/v1/health`,
      env: { PORT: String(BACKEND_PORT), NODE_ENV: 'test', DATABASE_URL: E2E_DB },
      stdout: process.env['PW_SERVER_LOGS'] ? 'pipe' : 'ignore',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `pnpm --dir ../backend exec tsx src/scripts/wait-e2e-db.ts && pnpm --dir ../backend exec tsx src/worker.ts`,
      env: { NODE_ENV: 'test', DATABASE_URL: E2E_DB },
      timeout: 120_000,
      wait: { stdout: /\[worker\] started/ },
      reuseExistingServer: false,
    },
    {
      command: `pnpm build && pnpm preview`,
      url: `http://localhost:${FRONTEND_PORT}`,
      env: { API_TARGET: `http://localhost:${BACKEND_PORT}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
