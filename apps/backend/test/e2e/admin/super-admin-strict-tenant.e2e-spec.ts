import SuperTest from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { createTestApp, closeTestApp } from '../../setup/app.setup';
import { cleanTables, testPrisma } from '../../setup/db.setup';

const TEST_JWT_ACCESS_SECRET = 'test-access-secret-32chars-min';
const accessSecret = () => process.env.JWT_ACCESS_SECRET ?? TEST_JWT_ACCESS_SECRET;
const ADMIN_HOST = 'admin.strict.test';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440000';
const MEMBERSHIP_ID = '660e8400-e29b-41d4-a716-446655440000';

describe('Super-admin strict tenancy (e2e)', () => {
  let req: SuperTest.Agent;
  let regularUserId: string;
  let superAdminUserId: string;

  beforeAll(async () => {
    process.env.ADMIN_HOSTS = ADMIN_HOST;
    ({ request: req } = await createTestApp({
      tenantEnforcement: 'strict',
      globalPrefix: true,
    }));

    await cleanTables([
      'SuperAdminActionLog',
      'ImpersonationSession',
      'RefreshToken',
      'Membership',
      'Organization',
      'User',
    ]);

    const passwordHash = await bcrypt.hash('Test@1234', 10);

    await testPrisma.organization.create({
      data: {
        id: ORG_ID,
        slug: 'strict-admin-e2e',
        nameAr: 'منظمة اختبار صارمة',
        nameEn: 'Strict Admin E2E',
      },
    });

    const regular = await testPrisma.user.create({
      data: {
        email: 'strict-regular@e2e.test',
        name: 'Strict Regular User',
        passwordHash,
        role: 'ADMIN',
        isActive: true,
        isSuperAdmin: false,
      },
    });
    regularUserId = regular.id;

    const superAdmin = await testPrisma.user.create({
      data: {
        email: 'strict-super@e2e.test',
        name: 'Strict Super Admin',
        passwordHash,
        role: 'ADMIN',
        isActive: true,
        isSuperAdmin: true,
      },
    });
    superAdminUserId = superAdmin.id;
  });

  afterAll(async () => {
    await cleanTables([
      'SuperAdminActionLog',
      'ImpersonationSession',
      'RefreshToken',
      'Membership',
      'Organization',
      'User',
    ]);
    await closeTestApp();
  });

  function tokenFor(
    user: { id: string; email: string },
    claims: Record<string, unknown> = {},
  ): string {
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: 'ADMIN',
        customRoleId: null,
        permissions: [],
        features: [],
        organizationId: ORG_ID,
        membershipId: MEMBERSHIP_ID,
        ...claims,
      },
      accessSecret(),
      { expiresIn: '1h' },
    );
  }

  it('GET /api/v1/admin/organizations returns 200 for a super-admin token on the admin host', async () => {
    const token = tokenFor(
      { id: superAdminUserId, email: 'strict-super@e2e.test' },
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

  it('GET /api/v1/admin/organizations returns 403 for the wrong host', async () => {
    const token = tokenFor(
      { id: superAdminUserId, email: 'strict-super@e2e.test' },
      { isSuperAdmin: true },
    );

    const res = await req
      .get('/api/v1/admin/organizations')
      .set('Authorization', `Bearer ${token}`)
      .set('Host', 'tenant.example.com');

    expect(res.status).toBe(403);
  });

  it('GET /api/v1/admin/organizations returns 403 for a non-super-admin user', async () => {
    const token = tokenFor(
      { id: regularUserId, email: 'strict-regular@e2e.test' },
      { isSuperAdmin: false },
    );

    const res = await req
      .get('/api/v1/admin/organizations')
      .set('Authorization', `Bearer ${token}`)
      .set('Host', ADMIN_HOST);

    expect(res.status).toBe(403);
  });

  it('dashboard private route without auth returns 401 instead of tenant resolution failure', async () => {
    const res = await req.get('/api/v1/dashboard/bookings').set('Host', 'tenant.example.com');

    expect(res.status).toBe(401);
  });

  it('public route without X-Org-Id returns tenant resolution failure in strict mode', async () => {
    const res = await req.get('/api/v1/public/services').set('Host', 'tenant.example.com');

    expect(res.status).toBe(400);
    expect(String(res.body.message)).toContain('Unable to resolve tenant');
  });
});
