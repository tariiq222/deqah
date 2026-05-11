import SuperTest from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { createTestApp, closeTestApp } from '../../setup/app.setup';
import { testPrisma, cleanTables, flushTestRedis } from '../../setup/db.setup';
import { DEFAULT_ORGANIZATION_ID } from '../../../src/common/tenant';

const TEST_JWT_ACCESS_SECRET = 'test-access-secret-32chars-min';
const accessSecret = () => process.env.JWT_ACCESS_SECRET ?? TEST_JWT_ACCESS_SECRET;

// Plan 05b — Task 9. Asserts that the super-admin surface area is
// reachable ONLY by users whose JWT carries isSuperAdmin=true AND whose
// Host header matches an entry in ADMIN_HOSTS. Every other combination
// must be rejected by guards (not just controllers).
describe('Super-admin isolation (e2e)', () => {
  let req: SuperTest.Agent;
  const ADMIN_HOST = 'admin.test';
  const LIVE_IMPERSONATION_SESSION_ID = 'admin-isolation-live-shadow-session';

  const ADMIN_ENDPOINTS: Array<{ method: 'get' | 'post'; path: string }> = [
    { method: 'get', path: '/api/v1/admin/organizations' },
    { method: 'get', path: '/api/v1/admin/users' },
    { method: 'get', path: '/api/v1/admin/plans' },
    { method: 'get', path: '/api/v1/admin/verticals' },
    { method: 'get', path: '/api/v1/admin/metrics/platform' },
    { method: 'get', path: '/api/v1/admin/audit-log' },
    { method: 'get', path: '/api/v1/admin/impersonation/sessions' },
  ];

  let regularUserId: string;
  let superAdminUserId: string;

  beforeAll(async () => {
    process.env.ADMIN_HOSTS = ADMIN_HOST;
    // This suite bursts ~31 requests through a single IP/anon tracker, which
    // collides with throttle counters left in Redis by earlier suites and
    // produces spurious 429s. Disable the throttler and flush Redis before
    // building the app.
    process.env.THROTTLER_DISABLED = 'true';
    await flushTestRedis();
    ({ request: req } = await createTestApp({ globalPrefix: true }));
    await cleanTables(['SuperAdminActionLog', 'ImpersonationSession', 'RefreshToken', 'Membership', 'User']);

    const passwordHash = await bcrypt.hash('Test@1234', 10);

    const regular = await testPrisma.user.create({
      data: {
        email: 'tenant-user@e2e.test',
        name: 'Regular Tenant User',
        passwordHash,
        role: 'RECEPTIONIST',
        isActive: true,
        isSuperAdmin: false,
      },
    });
    regularUserId = regular.id;

    const superAdmin = await testPrisma.user.create({
      data: {
        email: 'super@e2e.test',
        name: 'Super Admin',
        passwordHash,
        role: 'ADMIN',
        isActive: true,
        isSuperAdmin: true,
      },
    });
    superAdminUserId = superAdmin.id;

    // SaaS-01 invariant — every non-CLIENT staff user must have ≥1 active
    // Membership. The cleanTables call above wipes Membership+User, so we
    // must seed memberships here (otherwise foundation.e2e-spec.ts will
    // catch these as orphans). DEFAULT_ORGANIZATION_ID is seeded by
    // globalSetup and survives this suite's cleanup.
    await testPrisma.membership.createMany({
      data: [
        {
          userId: regularUserId,
          organizationId: DEFAULT_ORGANIZATION_ID,
          role: 'RECEPTIONIST',
          isActive: true,
          acceptedAt: new Date(),
        },
        {
          userId: superAdminUserId,
          organizationId: DEFAULT_ORGANIZATION_ID,
          role: 'OWNER',
          isActive: true,
          acceptedAt: new Date(),
        },
      ],
      skipDuplicates: true,
    });

    await testPrisma.impersonationSession.create({
      data: {
        id: LIVE_IMPERSONATION_SESSION_ID,
        superAdminUserId,
        targetUserId: regularUserId,
        organizationId: 'some-org',
        reason: 'e2e live shadow token replay guard',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        ipAddress: '127.0.0.1',
        userAgent: 'super-admin-isolation-e2e',
      },
    });
  });

  afterAll(async () => {
    await cleanTables(['SuperAdminActionLog', 'ImpersonationSession', 'RefreshToken', 'Membership', 'User']);
    delete process.env.THROTTLER_DISABLED;
    await closeTestApp();
  });

  function tokenFor(user: { id: string; email: string }, claims: Record<string, unknown> = {}): string {
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: 'RECEPTIONIST',
        customRoleId: null,
        permissions: [],
        features: [],
        ...claims,
      },
      accessSecret(),
      { expiresIn: '1h' },
    );
  }

  describe('AdminHostGuard (invariant 2)', () => {
    it.each(ADMIN_ENDPOINTS)(
      '$method $path → 403 when Host header is not in ADMIN_HOSTS',
      async ({ method, path }) => {
        const token = tokenFor(
          { id: superAdminUserId, email: 'super@e2e.test' },
          { isSuperAdmin: true },
        );
        const res = await req[method](path)
          .set('Authorization', `Bearer ${token}`)
          .set('Host', 'tenant.example.com');
        expect(res.status).toBe(403);
      },
    );
  });

  describe('SuperAdminGuard (invariants 1 + 4)', () => {
    it.each(ADMIN_ENDPOINTS)(
      '$method $path → 403 for a regular tenant user (no isSuperAdmin claim)',
      async ({ method, path }) => {
        const token = tokenFor(
          { id: regularUserId, email: 'tenant-user@e2e.test' },
          { organizationId: 'some-org' },
        );
        const res = await req[method](path)
          .set('Authorization', `Bearer ${token}`)
          .set('Host', ADMIN_HOST);
        expect(res.status).toBe(403);
      },
    );

    it.each(ADMIN_ENDPOINTS)(
      '$method $path → 403 for shadow impersonation JWT (scope=impersonation, no isSuperAdmin)',
      async ({ method, path }) => {
        const token = tokenFor(
          { id: superAdminUserId, email: 'super@e2e.test' },
          {
            scope: 'impersonation',
            impersonationSessionId: LIVE_IMPERSONATION_SESSION_ID,
            organizationId: 'some-org',
          },
        );
        const res = await req[method](path)
          .set('Authorization', `Bearer ${token}`)
          .set('Host', ADMIN_HOST);
        expect(res.status).toBe(403);
      },
    );

    it('rejects a JWT with isSuperAdmin=true claim if DB row says false (re-verification)', async () => {
      const token = tokenFor(
        { id: regularUserId, email: 'tenant-user@e2e.test' },
        { isSuperAdmin: true, organizationId: 'some-org' },
      );
      const res = await req
        .get('/api/v1/admin/organizations')
        .set('Authorization', `Bearer ${token}`)
        .set('Host', ADMIN_HOST);
      expect(res.status).toBe(403);
    });
  });

  describe('Unauthenticated', () => {
    it.each(ADMIN_ENDPOINTS)(
      '$method $path → 401 with no Authorization header',
      async ({ method, path }) => {
        const res = await req[method](path).set('Host', ADMIN_HOST);
        expect(res.status).toBe(401);
      },
    );
  });

  describe('Happy path — super-admin on admin host', () => {
    it('GET /api/v1/admin/organizations → 200', async () => {
      const token = tokenFor(
        { id: superAdminUserId, email: 'super@e2e.test' },
        { isSuperAdmin: true },
      );
      const res = await req
        .get('/api/v1/admin/organizations')
        .set('Authorization', `Bearer ${token}`)
        .set('Host', ADMIN_HOST);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('meta');
    });

    it('GET /api/v1/admin/audit-log → 200 (initially empty)', async () => {
      const token = tokenFor(
        { id: superAdminUserId, email: 'super@e2e.test' },
        { isSuperAdmin: true },
      );
      const res = await req
        .get('/api/v1/admin/audit-log')
        .set('Authorization', `Bearer ${token}`)
        .set('Host', ADMIN_HOST);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
    });
  });
});
