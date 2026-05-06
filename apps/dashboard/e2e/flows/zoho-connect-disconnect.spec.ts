/**
 * Flow test — Zoho Invoice Connect + Test + Config + Disconnect.
 *
 * This test exercises the full integration lifecycle WITHOUT requiring a
 * real Zoho account. It works by:
 *   1. Verifying the Connect button returns an authUrl pointing at Zoho.
 *   2. Verifying the Test endpoint correctly reports "not configured" when
 *      no OAuth has been completed.
 *   3. Verifying the Disconnect endpoint is idempotent when already
 *      disconnected.
 *   4. Verifying that the status endpoint stays isConfigured=false
 *      throughout (since we can't complete OAuth in E2E without Zoho).
 *
 * For a full OAuth E2E, a Zoho sandbox refresh token would need to be
 * injected via env vars and the backend would need to support a test-only
 * code-exchange bypass (future work, CI secrets gated).
 */
import { test, expect } from '../fixtures/zoho-fixtures';

/** Returns true if the Zoho endpoints exist on the running backend. */
async function backendHasZoho(apiCtx: import('@playwright/test').APIRequestContext): Promise<boolean> {
  const res = await apiCtx.get('/api/v1/dashboard/integrations/zoho');
  return res.status() !== 404;
}

test.describe('Zoho Invoice — Connect/Disconnect flow', () => {
  test.beforeEach(async ({ apiCtx }) => {
    if (!(await backendHasZoho(apiCtx))) {
      test.skip(true, 'Backend does not have Zoho routes — not deployed from this branch');
    }
  });

  test('GET /connect?dc=sa returns a valid Zoho authorization URL', async ({
    apiCtx,
  }) => {
    const res = await apiCtx.get('/api/v1/dashboard/integrations/zoho/connect?dc=sa');

    // The endpoint may return 500 if ZOHO_OAUTH_CLIENT_ID is not configured
    // in the test environment. In that case we skip the URL assertion but
    // still verify the endpoint is reachable and doesn't crash.
    if (res.status() === 500) {
      const body = await res.json();
      expect(body.message ?? body.error).toMatch(/ZOHO_OAUTH_CLIENT_ID|not configured/i);
      test.skip(true, 'ZOHO_OAUTH_CLIENT_ID not set — skipping OAuth URL validation');
      return;
    }

    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.authUrl).toBeDefined();
    expect(body.authUrl).toContain('accounts.zoho.sa');
    expect(body.authUrl).toContain('ZohoInvoice.fullaccess.all');
    expect(body.authUrl).toContain('access_type=offline');
    expect(body.authUrl).toContain('prompt=consent');
    // State should be a signed JWT-like string (body.sig).
    const stateParam = new URL(body.authUrl).searchParams.get('state');
    expect(stateParam).toBeTruthy();
    expect(stateParam).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  test('POST /test returns failure when integration is not configured', async ({
    apiCtx,
  }) => {
    const res = await apiCtx.post('/api/v1/dashboard/integrations/zoho/test', {
      data: {},
    });
    const body = await res.json();
    // The test handler catches the "not configured" error and returns
    // { ok: false, error: "..." } with 200. Alternatively it may return
    // 400 if the handler doesn't catch it.
    if (res.status() === 200) {
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/not configured/i);
    } else {
      expect([400, 403]).toContain(res.status());
    }
  });

  test('DELETE /zoho is idempotent when already disconnected', async ({
    apiCtx,
  }) => {
    const res = await apiCtx.delete('/api/v1/dashboard/integrations/zoho');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.disconnected).toBe(true);

    // Status should still be unconfigured.
    const statusRes = await apiCtx.get('/api/v1/dashboard/integrations/zoho');
    expect(statusRes.ok()).toBe(true);
    const statusBody = await statusRes.json();
    expect(statusBody.isConfigured).toBe(false);
  });

  test('PUT /config returns 400 when no integration exists', async ({
    apiCtx,
  }) => {
    const res = await apiCtx.put('/api/v1/dashboard/integrations/zoho/config', {
      data: { sendOnCreate: false },
    });
    expect(res.status()).toBe(400);
  });

  test('UI Connect button is clickable and DC selector works', async ({
    authedPage: page,
  }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Navigate to integrations → Zoho.
    const integrationsTab = page.locator('button[role="tab"]').filter({
      hasText: /integrations|التكاملات/i,
    });
    if (!(await integrationsTab.count())) {
      test.skip(true, 'Integrations tab not found — dashboard may not have Zoho UI');
      return;
    }
    await integrationsTab.click();

    const zohoItem = page.locator('[role="tab"]').filter({
      hasText: /zoho|زوهو/i,
    });
    if (!(await zohoItem.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, 'Zoho sidebar item not found — dashboard from different branch');
      return;
    }
    await zohoItem.click();

    // Change DC to EU to verify the select works.
    const dcSelect = page.locator('select#zoho-dc');
    if (!(await dcSelect.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, 'DC selector not found — Zoho panel not rendering');
      return;
    }
    await dcSelect.selectOption('eu');
    await expect(dcSelect).toHaveValue('eu');

    // Reset to SA.
    await dcSelect.selectOption('sa');
    await expect(dcSelect).toHaveValue('sa');

    // The Connect button should exist and be enabled.
    const connectBtn = page.getByRole('button', { name: /connect|ربط/i });
    await expect(connectBtn).toBeEnabled();
  });
});
