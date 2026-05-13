/**
 * Playwright configuration for apps/dashboard (per-tenant clinic).
 *
 * Prerequisites (run separately before `pnpm e2e`):
 *   1. Backend must be running:  npm run dev:backend  (port 5100)
 *   2. Docker stack (DB/Redis):  npm run docker:up
 *
 * The webServer block below spawns the Next.js dev server automatically
 * (or reuses an already-running one in non-CI mode).
 *
 * Projects:
 *   smoke  — e2e/smoke/**   ≤7 specs, <2 min, runs on every PR
 *   flows  — e2e/flows/**   full feature flows, runs nightly
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',

  timeout: 60_000,
  expect: { timeout: 10_000 },

  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,

  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: process.env.PW_DASHBOARD_URL ?? 'http://localhost:5103',
    headless: true,
    locale: 'ar-SA',
    timezoneId: 'Asia/Riyadh',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // globalSetup / globalTeardown — wired here for future persona pre-seeding.
  // Once D2+ tests use `test.use({ storageState })` patterns, enable these:
  //
  // TODO (playwright.config.ts): enable globalSetup once fixtures/auth.ts
  //   storageState approach is ready. Reference: e2e/fixtures/auth.ts →
  //   storageStatePath() + the planned e2e/global-setup.ts entry point.
  //
  // globalSetup: require.resolve('./e2e/global-setup'),
  // globalTeardown: require.resolve('./e2e/global-teardown'),

  projects: [
    {
      name: 'smoke',
      testMatch: 'e2e/smoke/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'flows',
      testMatch: 'e2e/flows/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'pnpm --filter dashboard dev',
    port: 5103,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {},
  },
});
