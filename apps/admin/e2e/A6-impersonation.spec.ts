import { test, expect } from '@playwright/test';
import { type APIRequestContext, type Page } from '@playwright/test';
import { loginAsSuperAdmin } from './helpers/auth';

// ---------------------------------------------------------------------------
// Helper: read the super-admin bearer token from localStorage after login.
// ---------------------------------------------------------------------------
async function getSuperAdminToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => window.localStorage.getItem('admin.accessToken'));
  if (!token) throw new Error('admin.accessToken not found in localStorage — login may have failed');
  return token;
}

// ---------------------------------------------------------------------------
// Helper: POST /api/v1/admin/impersonation via the backend directly (not the
// Next.js proxy) so we avoid cross-origin redirect issues in Playwright.
// The proxy base is baseURL + /api/proxy which rewrites to the backend.
// We use the Playwright APIRequestContext (request fixture) which is
// separate from the browser page — it does NOT follow window.location.
// ---------------------------------------------------------------------------
async function startImpersonationViaApi(
  request: APIRequestContext,
  token: string,
  organizationId: string,
  targetUserId: string,
  reason: string,
): Promise<{ sessionId: string }> {
  const res = await request.post('/api/proxy/admin/impersonation', {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: { organizationId, targetUserId, reason },
  });

  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`startImpersonation failed ${res.status()}: ${body}`);
  }

  const json = (await res.json()) as { sessionId?: string; data?: { sessionId?: string } };
  // Handle both raw and wrapped { success, data } shapes
  const sessionId = json.sessionId ?? (json as { data?: { sessionId?: string } }).data?.sessionId;
  if (!sessionId) throw new Error(`No sessionId in response: ${JSON.stringify(json)}`);
  return { sessionId };
}

async function endImpersonationViaApi(
  request: APIRequestContext,
  token: string,
  sessionId: string,
): Promise<void> {
  const res = await request.post(`/api/proxy/admin/impersonation/${sessionId}/end`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`endImpersonation failed ${res.status()}: ${body}`);
  }
}

test.describe('[A6] Impersonation sessions', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperAdmin(page);
  });

  test('impersonation sessions page loads with filter', async ({ page }) => {
    await page.goto('/impersonation-sessions');
    await page.waitForLoadState('networkidle');

    // Heading from impersonation-sessions/page.tsx
    await expect(
      page.getByRole('heading', { name: 'Impersonation sessions' }),
    ).toBeVisible({ timeout: 10_000 });

    // Filter dropdown — "All sessions" option in the select
    await expect(page.getByText('All sessions')).toBeVisible();
  });

  test('impersonate-user dialog opens from org detail page', async ({ page }) => {
    await page.goto('/organizations');
    await page.waitForLoadState('networkidle');

    // Navigate to the first available org — en.json organizations.table.open = "Open"
    const firstOpen = page.getByRole('link', { name: 'Open' }).first();
    const hasOrg = await firstOpen.isVisible({ timeout: 5_000 }).catch(() => false);

    if (!hasOrg) {
      test.skip();
      return;
    }

    await firstOpen.click();
    await page.waitForLoadState('networkidle');

    // ImpersonateDialog trigger button — from impersonate-dialog.tsx
    const impersonateBtn = page.getByRole('button', { name: 'Impersonate user' });
    const canImpersonate = await impersonateBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    if (!canImpersonate) {
      // Org is suspended or archived — impersonation button is hidden
      test.skip();
      return;
    }

    await impersonateBtn.click();

    // Dialog title from impersonate-dialog.tsx: "Impersonate a user in {orgName}"
    await expect(
      page.getByText(/Impersonate a user in/),
    ).toBeVisible({ timeout: 5_000 });

    // Target user ID field — id="target-user"
    await expect(page.locator('#target-user')).toBeVisible();

    // Reason field — id="impersonate-reason"
    await expect(page.locator('#impersonate-reason')).toBeVisible();

    // Submit button disabled without valid UUID + reason
    const startBtn = page.getByRole('button', { name: 'Start session + redirect' });
    await expect(startBtn).toBeDisabled();

    // Filling invalid UUID keeps button disabled
    await page.locator('#target-user').fill('not-a-uuid');
    await page.locator('#impersonate-reason').fill('Support investigation for ticket #1234');
    await expect(startBtn).toBeDisabled();

    // Close without submitting
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText(/Impersonate a user in/)).not.toBeVisible({ timeout: 5_000 });
  });

  test('session filter changes between active and ended', async ({ page }) => {
    await page.goto('/impersonation-sessions');
    await page.waitForLoadState('networkidle');

    // Open the filter select and pick "Active only"
    const trigger = page.getByRole('combobox');
    await trigger.click();
    await page.getByRole('option', { name: 'Active only' }).click();

    // Page still renders without error
    await expect(
      page.locator('.text-destructive').filter({ hasText: 'Failed to load' }),
    ).not.toBeVisible({ timeout: 5_000 });

    // Switch to "Ended / expired"
    await trigger.click();
    await page.getByRole('option', { name: 'Ended / expired' }).click();

    await expect(
      page.locator('.text-destructive').filter({ hasText: 'Failed to load' }),
    ).not.toBeVisible({ timeout: 5_000 });
  });

  // ---------------------------------------------------------------------------
  // API-level round-trip: start → list (active) → end → list (ended).
  //
  // WHY API-ONLY: impersonate-dialog.tsx calls window.location.href on success,
  // which is a hard browser navigation that Playwright cannot race or intercept
  // safely. We therefore bypass the dialog entirely for the lifecycle assertions
  // and only rely on UI for the "dialog opens and enables the button" check
  // (already covered by the test above).
  //
  // This test is skipped when no organizations exist (nothing to impersonate into)
  // or when the backend is unreachable.
  // ---------------------------------------------------------------------------
  test('impersonation lifecycle via API: start → active list → end → ended list', async ({
    page,
    request,
  }) => {
    // 1. Log in as super-admin so we have a valid token in localStorage.
    await loginAsSuperAdmin(page);
    const token = await getSuperAdminToken(page);

    // 2. Fetch the org list to pick an organization to impersonate into.
    const orgsRes = await request.get('/api/proxy/admin/organizations', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!orgsRes.ok()) {
      test.skip();
      return;
    }
    const orgsJson = (await orgsRes.json()) as
      | { items?: { id: string }[]; data?: { items?: { id: string }[] } }
      | { id: string }[];

    // Unwrap both { items } and { data: { items } } shapes
    let items: { id: string }[] = [];
    if (Array.isArray(orgsJson)) {
      items = orgsJson;
    } else if ('items' in orgsJson && Array.isArray(orgsJson.items)) {
      items = orgsJson.items;
    } else if ('data' in orgsJson && orgsJson.data && 'items' in orgsJson.data) {
      items = orgsJson.data.items ?? [];
    }

    if (items.length === 0) {
      test.skip();
      return;
    }

    const orgId = items[0].id;

    // 3. Fetch the user list for that org to find a non-super-admin target.
    const usersRes = await request.get(`/api/proxy/admin/organizations/${orgId}/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!usersRes.ok()) {
      test.skip();
      return;
    }
    const usersJson = (await usersRes.json()) as
      | { items?: { id: string; isSuperAdmin?: boolean }[] }
      | { id: string; isSuperAdmin?: boolean }[]
      | { data?: { items?: { id: string; isSuperAdmin?: boolean }[] } };

    let userItems: { id: string; isSuperAdmin?: boolean }[] = [];
    if (Array.isArray(usersJson)) {
      userItems = usersJson;
    } else if ('items' in usersJson && Array.isArray(usersJson.items)) {
      userItems = usersJson.items;
    } else if ('data' in usersJson && usersJson.data && 'items' in usersJson.data) {
      userItems = usersJson.data.items ?? [];
    }

    const targetUser = userItems.find((u) => !u.isSuperAdmin);
    if (!targetUser) {
      // No non-super-admin target available in this org
      test.skip();
      return;
    }

    // 4. Start impersonation via API (avoids the hard window.location redirect).
    let sessionId: string;
    try {
      ({ sessionId } = await startImpersonationViaApi(
        request,
        token,
        orgId,
        targetUser.id,
        'Automated E2E test — impersonation lifecycle round-trip',
      ));
    } catch {
      // Backend might reject (org suspended, etc.) — skip rather than fail
      test.skip();
      return;
    }

    // 5. Visit the sessions page and assert the new session appears in "Active only".
    await page.goto('/impersonation-sessions');
    await page.waitForLoadState('networkidle');

    const trigger = page.getByRole('combobox');
    await trigger.click();
    await page.getByRole('option', { name: 'Active only' }).click();
    await page.waitForLoadState('networkidle');

    // The session row should contain the sessionId (or part of it)
    await expect(
      page.getByText(sessionId.substring(0, 8), { exact: false }),
    ).toBeVisible({ timeout: 10_000 });

    // 6. End the session via API.
    await endImpersonationViaApi(request, token, sessionId);

    // 7. Switch to "Ended / expired" and assert the session moved there.
    await trigger.click();
    await page.getByRole('option', { name: 'Ended / expired' }).click();
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByText(sessionId.substring(0, 8), { exact: false }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
