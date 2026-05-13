/**
 * e2e/fixtures/tenant.ts
 *
 * Deterministic test-tenant descriptor for Playwright e2e tests.
 *
 * Strategy: rather than creating throwaway orgs per test (which requires a
 * super-admin service-account token and teardown logic), we rely on the
 * deterministic org seeded by `apps/backend/prisma/seed.ts` (DEFAULT_ORG_ID).
 * That seed script is idempotent and safe to re-run in CI beforeAll.
 *
 * `getTestTenant()` logs in as the seeded admin, calls the backend health
 * endpoint to confirm it is reachable, and returns the typed tenant descriptor
 * together with a valid access token for subsequent API calls in seed helpers.
 *
 * Usage:
 *   import { getTestTenant, TEST_TENANT } from '../fixtures/tenant';
 *
 *   let token: string;
 *   test.beforeAll(async () => {
 *     const t = await getTestTenant();
 *     token = t.accessToken;
 *   });
 */

// ─── Constants matching apps/backend/prisma/seed.ts defaults ──────────────

/** Fixed org ID written by seed.ts — never changes across runs. */
export const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

/** Hard-coded seed branch ID written by seed.ts. */
export const DEFAULT_BRANCH_ID = 'c1b2c3d4-e5f6-4a5b-8c9d-e0f1a2b3c4d5';

/** Backend base URL — override via PW_API_URL in CI. */
const API_BASE = process.env.PW_API_URL ?? 'http://localhost:5100';

// ─── Types ────────────────────────────────────────────────────────────────

export interface TestTenant {
  /** Organization UUID (matches DEFAULT_ORG_ID) */
  id: string;
  /** Human-readable slug used in dashboard routing */
  slug: string;
  nameAr: string;
  nameEn: string;
  /** Main branch UUID (matches DEFAULT_BRANCH_ID) */
  branchId: string;
  /** Admin user email (from SEED_EMAIL env or seed default) */
  adminEmail: string;
  /** Admin user password (from SEED_PASSWORD env or seed default) */
  adminPassword: string;
  /**
   * Valid JWT access token obtained by logging in as admin.
   * Populated by getTestTenant() — empty string on the static TEST_TENANT const.
   */
  accessToken: string;
}

// ─── Static const (no accessToken — use getTestTenant() for API calls) ───

/**
 * Static descriptor of the seeded test tenant.
 * Use this when you only need org metadata (IDs, credentials) and do NOT
 * need to make authenticated API calls.  For API calls, call getTestTenant()
 * which returns the same shape but with a live accessToken.
 */
export const TEST_TENANT: Readonly<Omit<TestTenant, 'accessToken'>> = {
  id: DEFAULT_ORG_ID,
  slug: 'default',
  nameAr: 'منظمتي',
  nameEn: 'My Organization',
  branchId: DEFAULT_BRANCH_ID,
  adminEmail: process.env.SEED_EMAIL ?? 'admin@deqah-test.com',
  adminPassword: process.env.SEED_PASSWORD ?? 'Admin@1234',
};

// ─── Login response shape (partial — only what we use) ────────────────────

interface LoginResponseBody {
  accessToken: string;
  organizationId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Obtain a live accessToken by logging in as the seeded admin user, then
 * return the full TestTenant descriptor.
 *
 * Throws a descriptive error if the backend is not reachable or credentials
 * are wrong — which surfaces the root cause immediately rather than letting
 * individual tests fail with cryptic 401s.
 */
export async function getTestTenant(): Promise<TestTenant> {
  const { adminEmail, adminPassword } = TEST_TENANT;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
  } catch (err) {
    throw new Error(
      `[e2e/fixtures/tenant] Backend unreachable at ${API_BASE}. ` +
        `Start the backend with 'npm run dev:backend' before running e2e tests. ` +
        `Original error: ${String(err)}`,
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable body)');
    throw new Error(
      `[e2e/fixtures/tenant] Login failed for ${adminEmail} — HTTP ${res.status}. ` +
        `Ensure 'npm run seed' has been run in apps/backend. Body: ${body}`,
    );
  }

  const data = (await res.json()) as LoginResponseBody;

  if (!data.accessToken) {
    throw new Error(
      `[e2e/fixtures/tenant] Login response missing accessToken. Got: ${JSON.stringify(data)}`,
    );
  }

  return {
    ...TEST_TENANT,
    accessToken: data.accessToken,
  };
}

/**
 * Return the dashboard base URL (for baseURL overrides in tests).
 * Defaults to the PW_DASHBOARD_URL env var or localhost:5103.
 */
export function dashboardBaseUrl(): string {
  return process.env.PW_DASHBOARD_URL ?? 'http://localhost:5103';
}
