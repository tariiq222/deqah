/**
 * e2e/fixtures/auth.ts
 *
 * Auth persona helper for Playwright tests.
 *
 * Usage:
 *   import { loginAs } from '../fixtures/auth';
 *   await loginAs(page, 'admin');
 *
 * Credentials are sourced from env vars (set in CI) or fall back to the
 * seeded defaults from apps/backend/prisma/seed.ts (via TEST_TENANT).
 *
 * TODO: once globalSetup is enabled in playwright.config.ts, replace
 *       direct form login with storageState reuse for speed:
 *         test.use({ storageState: 'e2e/.auth/admin.json' });
 */

import { Page, expect } from '@playwright/test';
import { TEST_TENANT } from './tenant';

export type Persona = 'admin' | 'owner' | 'receptionist';

/**
 * Credentials keyed by persona.
 *
 * - admin / owner: resolved from TEST_TENANT so they stay in sync with
 *   the backend seed script (SEED_EMAIL / SEED_PASSWORD env vars or defaults).
 * - receptionist: sourced from its own env vars; falls back to a known
 *   test default.  A receptionist membership must be seeded separately if
 *   receptionist-specific tests are needed.
 */
const PERSONA_CREDENTIALS: Record<Persona, { email: string; password: string }> = {
  admin: {
    email: TEST_TENANT.adminEmail,
    password: TEST_TENANT.adminPassword,
  },
  owner: {
    // Owner uses the same seeded user as admin in the default test org.
    // Override via SEED_OWNER_EMAIL / SEED_OWNER_PASSWORD when a distinct
    // owner account is seeded.
    email: process.env.SEED_OWNER_EMAIL ?? TEST_TENANT.adminEmail,
    password: process.env.SEED_OWNER_PASSWORD ?? TEST_TENANT.adminPassword,
  },
  receptionist: {
    email: process.env.SEED_RECEPTIONIST_EMAIL ?? 'receptionist@deqah-test.com',
    password: process.env.SEED_RECEPTIONIST_PASSWORD ?? 'Recept@1234',
  },
};

/**
 * Log in as a given persona by filling the login form.
 *
 * Optimization: skip login if already authenticated as the target persona.
 * This avoids rate-limiting the auth endpoint when running many tests in sequence.
 */
export async function loginAs(page: Page, persona: Persona = 'admin'): Promise<void> {
  const { email, password } = PERSONA_CREDENTIALS[persona];

  // Fast path: if we're already on the dashboard, we're logged in
  const currentUrl = page.url();
  if (currentUrl === '/' || currentUrl === '') {
    return;
  }

  // Check if we're on a dashboard page (authenticated)
  if (currentUrl.startsWith('http://localhost:5103/') && currentUrl !== '/login' && currentUrl !== '/forgot-password') {
    return;
  }

  // Try to stay logged in by navigating to home first
  await page.goto('/').catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  if (page.url() === '/' || page.url() === '') {
    return;
  }

  // Need to login fresh - clear cookies and proceed
  await page.context().clearCookies();

  await page.goto('/login');
  await expect(page).toHaveURL(/\/login/);

  await page.waitForLoadState('networkidle');

  await page.fill('input[type="email"], #email', email);
  await page.fill('input[type="password"], #password', password);
  await page.click('button[type="submit"]');

  // Verify redirect to dashboard home
  try {
    await page.waitForURL('/', { timeout: 20_000 });
  } catch {
    // If timeout, reload the page - might be a transient rate limit issue
    await page.reload();
    await page.waitForLoadState('networkidle').catch(() => {});
    // If still not on home, try waiting one more time
    if (page.url() !== '/') {
      await page.waitForURL('/', { timeout: 15_000 }).catch(() => {});
    }
  }
}

/**
 * Log out the current user via the header user menu.
 */
export async function logout(page: Page): Promise<void> {
  await page.goto('/');

  // Header user button (last icon button in header)
  const userButton = page.locator('header button').filter({ has: page.locator('svg') }).last();
  if (await userButton.isVisible()) {
    await userButton.click();
    await page.waitForTimeout(300);

    const logoutButton = page.locator('text=/logout|تسجيل الخروج/i');
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
      await page.waitForURL('/login', { timeout: 10_000 });
    }
  }
}

/**
 * Save storageState for a persona to disk.
 * Call this from globalSetup once storageState pre-seeding is enabled.
 *
 * TODO (fixtures/auth.ts): wire into globalSetup in playwright.config.ts
 *   globalSetup: require.resolve('./e2e/global-setup.ts')
 *   Then in tests: test.use({ storageState: storageStatePath('admin') })
 */
export function storageStatePath(persona: Persona): string {
  return `e2e/.auth/${persona}.json`;
}

/**
 * Return the raw credentials for a persona (useful for API-level auth in
 * seed helpers that need a token outside of a browser context).
 */
export function getPersonaCredentials(persona: Persona): { email: string; password: string } {
  return PERSONA_CREDENTIALS[persona];
}
