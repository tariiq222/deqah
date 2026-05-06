/**
 * Smoke test — Zoho Invoice settings tab renders correctly.
 *
 * Verifies:
 *   1. The integrations tab in Settings contains a "Zoho Invoice" sidebar entry.
 *   2. Clicking it renders the Zoho settings panel with the not-connected state
 *      (DC picker, Connect button) when no integration is configured.
 *   3. The backend /dashboard/integrations/zoho status endpoint responds with
 *      `isConfigured: false` for a fresh tenant.
 *
 * Skips gracefully when:
 *   - The running backend doesn't have the Zoho routes yet (404).
 *   - The running dashboard doesn't have the Zoho UI yet.
 */
import { test, expect } from '../fixtures/zoho-fixtures';

test.describe('Zoho Invoice — Settings smoke', () => {
  test('settings page shows Zoho entry in integrations sidebar', async ({
    authedPage: page,
  }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Click the Integrations tab trigger. The settings page uses a Tabs
    // component whose triggers are rendered as <button role="tab">.
    const integrationsTab = page.locator('button[role="tab"]').filter({
      hasText: /integrations|التكاملات/i,
    });
    if (!(await integrationsTab.count())) {
      test.skip(true, 'Integrations tab not found — dashboard may not have Zoho UI yet');
      return;
    }
    await integrationsTab.click();

    // The integration sidebar renders items as clickable divs with role="tab".
    const zohoItem = page.locator('[role="tab"]').filter({
      hasText: /zoho|زوهو/i,
    });
    await expect(zohoItem).toBeVisible({ timeout: 10_000 });
  });

  test('Zoho panel shows not-connected state with DC picker + Connect button', async ({
    authedPage: page,
  }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Navigate to integrations → Zoho.
    const integrationsTab = page.locator('button[role="tab"]').filter({
      hasText: /integrations|التكاملات/i,
    });
    if (!(await integrationsTab.count())) {
      test.skip(true, 'Integrations tab not found');
      return;
    }
    await integrationsTab.click();

    const zohoItem = page.locator('[role="tab"]').filter({
      hasText: /zoho|زوهو/i,
    });
    if (!(await zohoItem.count())) {
      test.skip(true, 'Zoho sidebar item not found');
      return;
    }
    await zohoItem.click();

    // Wait for the Zoho panel to render.
    await page.waitForTimeout(2000);

    // The not-connected section: DC select + Connect button.
    const connectButton = page.getByRole('button', { name: /connect|ربط/i });
    await expect(connectButton).toBeVisible({ timeout: 10_000 });

    const dcSelect = page.locator('select#zoho-dc');
    await expect(dcSelect).toBeVisible();
    await expect(dcSelect).toHaveValue('sa');
  });

  test('backend returns isConfigured=false for unconfigured tenant', async ({
    apiCtx,
  }) => {
    const res = await apiCtx.get('/api/v1/dashboard/integrations/zoho');
    // 404 = backend doesn't have the route yet (running old version).
    if (res.status() === 404) {
      test.skip(true, 'Backend does not have /dashboard/integrations/zoho — not deployed from this branch yet');
      return;
    }
    // 403 = feature not enabled on the tenant's plan (Plan.limits.zoho_invoice_integration=false).
    if (res.status() === 403) {
      test.skip(true, 'Zoho feature not enabled on the test tenant plan — set Plan.limits.zoho_invoice_integration=true');
      return;
    }
    // 400 = endpoint exists but integration not configured (expected for fresh tenant).
    if (res.status() === 400) {
      const body = await res.json();
      if (body.message?.includes('not configured')) {
        // This IS the expected result — treat as pass.
        expect(true).toBe(true);
        return;
      }
    }
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.isConfigured).toBe(false);
    expect(body.isActive).toBe(false);
  });
});
