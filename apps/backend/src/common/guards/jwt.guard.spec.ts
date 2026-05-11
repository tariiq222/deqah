import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtGuard } from './jwt.guard';

const makeCtx = (handler: object, cls: object, req: object = {}) =>
  ({
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  }) as unknown as ExecutionContext;

describe('JwtGuard', () => {
  let reflector: Reflector;
  let guard: JwtGuard;
  const prisma = {
    organization: {
      findUnique: jest.fn(),
    },
  };
  const redisClient = {
    get: jest.fn(),
    set: jest.fn(),
  };
  const redis = {
    getClient: jest.fn(() => redisClient),
  };
  const tenantContext = {
    set: jest.fn(),
  };

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtGuard(reflector, prisma as never, redis as never, tenantContext as never);
    prisma.organization.findUnique.mockReset();
    redis.getClient.mockReset();
    redis.getClient.mockImplementation(() => redisClient);
    redisClient.get.mockReset();
    redisClient.set.mockReset();
    tenantContext.set.mockReset();
  });

  it('returns true for public routes', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    await expect(guard.canActivate(makeCtx({}, {}))).resolves.toBe(true);
  });

  it('handleRequest returns user when token is valid', () => {
    const user = { id: 'u-1' };
    expect(guard.handleRequest(null, user, null, {} as ExecutionContext)).toBe(user);
  });

  it('handleRequest throws UnauthorizedException when no user', () => {
    expect(() =>
      guard.handleRequest(null, null as never, null, {} as ExecutionContext),
    ).toThrow(UnauthorizedException);
  });

  it('handleRequest throws UnauthorizedException when error present', () => {
    expect(() =>
      guard.handleRequest(new Error('fail'), null as never, null, {} as ExecutionContext),
    ).toThrow(UnauthorizedException);
  });

  it('stamps TenantContext after JWT validation', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const passportCanActivate = jest
      .spyOn(Object.getPrototypeOf(JwtGuard.prototype), 'canActivate')
      .mockResolvedValue(true);
    redisClient.get.mockResolvedValue('active');

    const ctx = makeCtx(
      {},
      {},
      {
        user: {
          id: 'user-1',
          organizationId: 'org-1',
          membershipId: 'member-1',
          role: 'ADMIN',
          isSuperAdmin: false,
        },
      },
    );

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(tenantContext.set).toHaveBeenCalledWith({
      organizationId: 'org-1',
      membershipId: 'member-1',
      id: 'user-1',
      role: 'ADMIN',
      isSuperAdmin: false,
    });

    passportCanActivate.mockRestore();
  });

  // ─── TAR-10: tenant resolution order (after auth) ────────────────────────
  // The tenant-resolver MIDDLEWARE runs before Passport, so super-admin
  // X-Org-Id override (which depends on req.user.isSuperAdmin) was dead
  // code there. JwtGuard now owns this responsibility because it runs
  // AFTER Passport has populated req.user.
  describe('TAR-10: tenant context stamping with super-admin X-Org-Id override', () => {
    const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
    const OTHER_UUID = '660e8400-e29b-41d4-a716-446655440001';
    let passportCanActivate: jest.SpyInstance;

    beforeEach(() => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      passportCanActivate = jest
        .spyOn(Object.getPrototypeOf(JwtGuard.prototype), 'canActivate')
        .mockResolvedValue(true);
      redisClient.get.mockResolvedValue('active');
    });

    afterEach(() => {
      passportCanActivate.mockRestore();
    });

    it('normal tenant user: JWT organizationId wins; X-Org-Id is ignored', async () => {
      const ctx = makeCtx({}, {}, {
        user: {
          id: 'user-1',
          organizationId: 'org-jwt',
          membershipId: 'member-1',
          role: 'ADMIN',
          isSuperAdmin: false,
        },
        headers: { 'x-org-id': OTHER_UUID },
      });

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(tenantContext.set).toHaveBeenCalledWith({
        organizationId: 'org-jwt',
        membershipId: 'member-1',
        id: 'user-1',
        role: 'ADMIN',
        isSuperAdmin: false,
      });
    });

    it('super-admin: valid X-Org-Id header overrides JWT organizationId', async () => {
      const ctx = makeCtx({}, {}, {
        user: {
          id: 'admin-1',
          organizationId: 'platform-org',
          membershipId: '',
          role: 'SUPER_ADMIN',
          isSuperAdmin: true,
        },
        headers: { 'x-org-id': VALID_UUID },
      });

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(tenantContext.set).toHaveBeenCalledWith({
        organizationId: VALID_UUID,
        membershipId: '',
        id: 'admin-1',
        role: 'SUPER_ADMIN',
        isSuperAdmin: true,
      });
    });

    it('super-admin without X-Org-Id: falls back to JWT organizationId', async () => {
      const ctx = makeCtx({}, {}, {
        user: {
          id: 'admin-1',
          organizationId: 'platform-org',
          membershipId: '',
          role: 'SUPER_ADMIN',
          isSuperAdmin: true,
        },
        headers: {},
      });

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(tenantContext.set).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'platform-org', isSuperAdmin: true }),
      );
    });

    it('super-admin with invalid (non-UUID) X-Org-Id: header ignored, JWT used', async () => {
      const ctx = makeCtx({}, {}, {
        user: {
          id: 'admin-1',
          organizationId: 'platform-org',
          membershipId: '',
          role: 'SUPER_ADMIN',
          isSuperAdmin: true,
        },
        headers: { 'x-org-id': 'not-a-uuid' },
      });

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(tenantContext.set).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'platform-org' }),
      );
    });

    it('non-super-admin sending X-Org-Id is silently ignored (security)', async () => {
      // Attacker scenario: a regular ADMIN sends X-Org-Id trying to act on
      // another tenant. Guard must use the JWT-bound org and discard the
      // header entirely.
      const ctx = makeCtx({}, {}, {
        user: {
          id: 'user-attacker',
          organizationId: 'org-victim-attempt',
          membershipId: 'm-1',
          role: 'ADMIN',
          isSuperAdmin: false,
        },
        headers: { 'x-org-id': 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
      });

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      const call = tenantContext.set.mock.calls[0][0] as { organizationId: string };
      expect(call.organizationId).toBe('org-victim-attempt');
      expect(call.organizationId).not.toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    });

    it('super-admin with no organizationId on JWT and no header: context not stamped', async () => {
      // Platform-only super-admin (no membership) hitting an endpoint that
      // does not require a tenant. assertOrganizationIsActive short-circuits
      // on undefined organizationId, so the request still passes.
      const ctx = makeCtx({}, {}, {
        user: {
          id: 'admin-1',
          role: 'SUPER_ADMIN',
          isSuperAdmin: true,
        },
        headers: {},
      });

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(tenantContext.set).not.toHaveBeenCalled();
    });

    it('missing user (Passport failure path): context not stamped', async () => {
      // Defensive: if super.canActivate somehow resolved true without
      // populating req.user, we must not blow up trying to read .isSuperAdmin.
      const ctx = makeCtx({}, {}, { headers: { 'x-org-id': VALID_UUID } });

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(tenantContext.set).not.toHaveBeenCalled();
    });

    it('super-admin overriding into a SUSPENDED target tenant is rejected (suspension check uses effective org)', async () => {
      // TAR-10 follow-up: stampTenantContext AND assertOrganizationIsActive
      // must operate on the same effective org id. Otherwise a super-admin
      // could write to a suspended tenant because the suspension check
      // would target their own (non-suspended) platform org.
      redisClient.get.mockResolvedValue('2026-04-22T10:00:00.000Z'); // suspended

      const ctx = makeCtx({}, {}, {
        user: {
          id: 'admin-1',
          organizationId: 'platform-org',
          role: 'SUPER_ADMIN',
          isSuperAdmin: true,
        },
        headers: { 'x-org-id': VALID_UUID },
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow('ORG_SUSPENDED');
      // Cache key was built from the OVERRIDE org, not the JWT org.
      expect(redisClient.get).toHaveBeenCalledWith(`org-suspension:${VALID_UUID}`);
    });

    it('header in array form (Express multi-value): rejected as invalid UUID', async () => {
      // Express may surface duplicate headers as string[]; parseUuidHeader
      // only accepts strings, so multi-value headers fall through to JWT.
      const ctx = makeCtx({}, {}, {
        user: {
          id: 'admin-1',
          organizationId: 'platform-org',
          role: 'SUPER_ADMIN',
          isSuperAdmin: true,
        },
        headers: { 'x-org-id': [VALID_UUID, OTHER_UUID] },
      });

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(tenantContext.set).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'platform-org' }),
      );
    });
  });

  it('skips suspension lookup when no organizationId is present', async () => {
    await expect(guard.assertOrganizationIsActive(undefined)).resolves.toBeUndefined();
    expect(redis.getClient).not.toHaveBeenCalled();
  });

  it('allows when Redis says the organization is active', async () => {
    redisClient.get.mockResolvedValue('active');

    await expect(guard.assertOrganizationIsActive('org-1')).resolves.toBeUndefined();
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('rejects when Redis cache says the organization is suspended', async () => {
    redisClient.get.mockResolvedValue('2026-04-22T10:00:00.000Z');

    await expect(guard.assertOrganizationIsActive('org-1')).rejects.toThrow(
      'ORG_SUSPENDED',
    );
  });

  it('caches active org state for 30 seconds on a cache miss', async () => {
    redisClient.get.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue({ suspendedAt: null });

    await expect(guard.assertOrganizationIsActive('org-1')).resolves.toBeUndefined();
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      select: { suspendedAt: true },
    });
    expect(redisClient.set).toHaveBeenCalledWith('org-suspension:org-1', 'active', 'EX', 30);
  });

  it('caches suspended org state and rejects on a cache miss', async () => {
    const suspendedAt = new Date('2026-04-22T10:00:00.000Z');
    redisClient.get.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue({ suspendedAt });

    await expect(guard.assertOrganizationIsActive('org-1')).rejects.toThrow(
      'ORG_SUSPENDED',
    );
    expect(redisClient.set).toHaveBeenCalledWith(
      'org-suspension:org-1',
      suspendedAt.toISOString(),
      'EX',
      30,
    );
  });

  // ─── Bug B10 — @AllowDuringSuspension recovery decorator ─────────────────
  describe('Bug B10: @AllowDuringSuspension recovery exemption', () => {
    it('rejects suspended org by default (no decorator)', async () => {
      redisClient.get.mockResolvedValue('2026-04-22T10:00:00.000Z');
      await expect(
        guard.assertOrganizationIsActive('org-1'),
      ).rejects.toThrow('ORG_SUSPENDED');
    });

    it('allows suspended org when @AllowDuringSuspension AND user is OWNER', async () => {
      redisClient.get.mockResolvedValue('2026-04-22T10:00:00.000Z');
      await expect(
        guard.assertOrganizationIsActive('org-1', {
          allowDuringSuspension: true,
          membershipRole: 'OWNER',
        }),
      ).resolves.toBeUndefined();
    });

    it('rejects suspended org when @AllowDuringSuspension but user is not OWNER (e.g. RECEPTIONIST)', async () => {
      redisClient.get.mockResolvedValue('2026-04-22T10:00:00.000Z');
      await expect(
        guard.assertOrganizationIsActive('org-1', {
          allowDuringSuspension: true,
          membershipRole: 'RECEPTIONIST',
        }),
      ).rejects.toThrow('ORG_SUSPENDED');
    });

    it('rejects suspended org when @AllowDuringSuspension but membershipRole missing', async () => {
      redisClient.get.mockResolvedValue('2026-04-22T10:00:00.000Z');
      await expect(
        guard.assertOrganizationIsActive('org-1', {
          allowDuringSuspension: true,
        }),
      ).rejects.toThrow('ORG_SUSPENDED');
    });

    it('rejects suspended org for OWNER when decorator absent', async () => {
      redisClient.get.mockResolvedValue('2026-04-22T10:00:00.000Z');
      await expect(
        guard.assertOrganizationIsActive('org-1', {
          allowDuringSuspension: false,
          membershipRole: 'OWNER',
        }),
      ).rejects.toThrow('ORG_SUSPENDED');
    });

    it('rejection includes bilingual recovery hint', async () => {
      redisClient.get.mockResolvedValue('2026-04-22T10:00:00.000Z');
      try {
        await guard.assertOrganizationIsActive('org-1');
        fail('expected to throw');
      } catch (err) {
        const ex = err as UnauthorizedException;
        const body = ex.getResponse() as {
          code?: string;
          recoveryHint?: { ar?: string; en?: string };
        };
        expect(body.code).toBe('ORG_SUSPENDED');
        expect(body.recoveryHint?.ar).toContain('معلّق');
        expect(body.recoveryHint?.en).toContain('suspended');
      }
    });

    it('cached-suspension path also honors recovery exemption', async () => {
      // Cache is hot with a suspendedAt timestamp; verify the decorator path
      // still bypasses for OWNER without re-querying Postgres.
      redisClient.get.mockResolvedValue('2026-04-22T10:00:00.000Z');
      await expect(
        guard.assertOrganizationIsActive('org-1', {
          allowDuringSuspension: true,
          membershipRole: 'OWNER',
        }),
      ).resolves.toBeUndefined();
      expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    });
  });
});
