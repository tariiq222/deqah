/**
 * Admin Playwright fixtures — super-admin auth via API.
 *
 * Inlines auth helpers (admin doesn't depend on @deqah/test-helpers-pw).
 */
import { test as base, request as pwRequest, type Page, type APIRequestContext } from '@playwright/test';

const BACKEND = process.env.PW_BACKEND_URL ?? 'http://localhost:5100';
const ADMIN = process.env.PW_ADMIN_URL ?? 'http://localhost:5104';
const EMAIL = process.env.PW_SUPER_ADMIN_EMAIL ?? 'tariq.alwalidi@gmail.com';
const PASSWORD = process.env.PW_SUPER_ADMIN_PASSWORD ?? 'Admin@2026';

interface LoginResult {
  accessToken: string;
}

async function loginSuperAdmin(ctx: APIRequestContext): Promise<LoginResult> {
  const res = await ctx.post(`${BACKEND}/api/v1/auth/login`, {
    data: { email: EMAIL, password: PASSWORD, hCaptchaToken: 'pw-test-captcha' },
  });
  if (!res.ok()) {
    throw new Error(`Super-admin login failed: ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  // CR-9: refresh token is now httpOnly cookie (ck_refresh); not in response body
  return { accessToken: body.accessToken };
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

  authedPage: async ({ page, loginResult }, use) => {
    // addInitScript runs on EVERY page load (including `about:blank`).
    // We unconditionally set localStorage — the init script runs before
    // React hydrates so AuthGate picks up the token on first render.
    // CR-9: refresh token is httpOnly cookie set by the server; no localStorage entry needed.
    await page.addInitScript(
      ({ access }) => {
        window.localStorage.setItem('admin.accessToken', access);
      },
      { access: loginResult.accessToken },
    );
    await use(page);
  },
});

export { expect } from '@playwright/test';
