/**
 * Playwright fixtures for Zoho Invoice E2E tests.
 *
 * Provides:
 *   - `authedPage` — a Page with the tenant-owner's JWT injected via
 *     localStorage (no /login UI round-trip, no captcha).
 *   - `apiCtx` — an APIRequestContext with the same tenant-owner's
 *     Bearer token for direct backend assertions.
 *   - `backendUrl` — backend base URL for direct API calls.
 */
import { test as base, type Page, type APIRequestContext } from '@playwright/test';
import { loginViaApi, type LoginResult } from '@deqah/test-helpers-pw';
import { PWConfig } from '@deqah/test-helpers-pw';

type ZohoFixtures = {
  authedPage: Page;
  apiCtx: APIRequestContext;
  backendUrl: string;
  loginResult: LoginResult;
};

export const test = base.extend<ZohoFixtures>({
  backendUrl: [PWConfig.backendBaseUrl, { option: true }],

  loginResult: async ({ request }, use) => {
    // Use admin@deqah-test.com (the seed user who owns the default org).
    const result = await loginViaApi(
      request,
      process.env.PW_OWNER_EMAIL ?? 'admin@deqah-test.com',
      process.env.PW_OWNER_PASSWORD ?? 'Admin@1234',
    );
    await use(result);
  },

  apiCtx: async ({ playwright: pw, loginResult }, use) => {
    // The default `request` context shares cookies with the browser context.
    // For API-only assertions we prefer using a separate context with the
    // Bearer header explicitly set.
    const ctx = await pw.request.newContext({
      baseURL: PWConfig.backendBaseUrl,
      extraHTTPHeaders: {
        Authorization: `Bearer ${loginResult.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    await use(ctx);
    await ctx.dispose();
  },

  authedPage: async ({ page, loginResult }, use) => {
    // addInitScript runs on EVERY page load (including `about:blank`).
    // Set localStorage unconditionally so AuthGate picks up the token.
    await page.addInitScript(
      ({ access, refresh }) => {
        window.localStorage.setItem('deqah.accessToken', access);
        window.localStorage.setItem('deqah.refreshToken', refresh);
      },
      { access: loginResult.accessToken, refresh: loginResult.refreshToken },
    );
    await use(page);
  },
});

export { expect } from '@playwright/test';
