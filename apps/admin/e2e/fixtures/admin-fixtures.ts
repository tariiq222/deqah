/**
 * Admin Playwright fixtures — super-admin auth via API.
 *
 * Inlines auth helpers (admin doesn't depend on @deqah/test-helpers-pw).
 */
import { test as base, request as pwRequest, type Page, type APIRequestContext } from '@playwright/test';

const BACKEND = process.env.PW_BACKEND_URL ?? 'http://localhost:5100';
const ADMIN = process.env.PW_ADMIN_URL ?? 'http://localhost:5104';
const EMAIL = process.env.PW_SUPER_ADMIN_EMAIL;
const PASSWORD = process.env.PW_SUPER_ADMIN_PASSWORD;

if (!EMAIL || !PASSWORD) {
  throw new Error('PW_SUPER_ADMIN_EMAIL and PW_SUPER_ADMIN_PASSWORD environment variables are required for e2e tests');
}

interface LoginResult {
  accessToken: string;
  refreshToken: string;
}

async function loginSuperAdmin(ctx: APIRequestContext): Promise<LoginResult> {
  const res = await ctx.post(`${BACKEND}/api/v1/auth/login`, {
    data: { email: EMAIL, password: PASSWORD, hCaptchaToken: 'pw-test-captcha' },
  });
  if (!res.ok()) {
    throw new Error(`Super-admin login failed: ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  return { accessToken: body.accessToken, refreshToken: body.refreshToken };
}

type AdminFixtures = {
  authedPage: Page;
  apiCtx: APIRequestContext;
  loginResult: LoginResult;
};

export const test = base.extend<AdminFixtures>({
  loginResult: async ({ request }, use) => {
    const result = await loginSuperAdmin(request);
    await use(result);
  },

  apiCtx: async ({ loginResult }, use) => {
    const ctx = await pwRequest.newContext({
      baseURL: BACKEND,
      extraHTTPHeaders: {
        Authorization: `Bearer ${loginResult.accessToken}`,
        'Content-Type': 'application/json',
        Host: 'localhost:5100',
      },
    });
    await use(ctx);
    await ctx.dispose();
  },

  authedPage: async ({ page, loginResult, baseURL }, use) => {
    // addInitScript runs on EVERY page load (including `about:blank`).
    // We unconditionally set localStorage — the init script runs before
    // React hydrates so AuthGate picks up the token on first render.
    await page.addInitScript(
      ({ access, refresh }) => {
        window.localStorage.setItem('admin.accessToken', access);
        window.localStorage.setItem('admin.refreshToken', refresh);
      },
      { access: loginResult.accessToken, refresh: loginResult.refreshToken },
    );
    await use(page);
  },
});

export { expect } from '@playwright/test';