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

  apiCtx: async ({ request, loginResult }, use) => {
    // The default `request` context shares cookies with the browser context.
    // For API-only assertions we prefer using a separate context with the
    // Bearer header explicitly set.
    const ctx = await base.request.newContext({
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
    // CR-9: refresh token is httpOnly cookie (ck_refresh); not stored in localStorage.
    await page.addInitScript(
      ({ access }) => {
        window.localStorage.setItem('deqah.accessToken', access);
      },
      { access: loginResult.accessToken },
    );
    await use(page);
  },
});

export { expect } from '@playwright/test';
