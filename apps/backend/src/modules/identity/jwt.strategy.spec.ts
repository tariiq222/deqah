import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../infrastructure/database';
import { CaslAbilityFactory } from './casl/casl-ability.factory';

/** Minimal ClsService mock: run() executes the callback, set() is a no-op. */
const makeClsMock = () => ({
  run: jest.fn().mockImplementation((cb: () => unknown) => cb()),
  set: jest.fn(),
});

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: any;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: { getOrThrow: jest.fn().mockReturnValue('secret-key') } },
        { provide: PrismaService, useValue: {
          user: { findUnique: jest.fn() },
          membership: { findFirst: jest.fn().mockResolvedValue({ id: 'm1' }) },
        } },
        { provide: CaslAbilityFactory, useValue: { buildForUser: jest.fn().mockReturnValue({ rules: [] }) } },
        { provide: ClsService, useValue: makeClsMock() },
      ],
    }).compile();

    strategy = module.get(JwtStrategy);
    prisma = module.get(PrismaService);
  });

  it('returns enriched user object for valid payload', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1', email: 'a@b.com', role: 'ADMIN',
      customRoleId: null, customRole: null, isActive: true,
    } as never);

    const result = await strategy.validate({ sub: 'u1', email: 'a@b.com', role: 'ADMIN', customRoleId: null, permissions: [], features: [], organizationId: 'org-1' });
    expect(result.id).toBe('u1');
    expect(result.permissions).toBeDefined();
  });

  it('throws UnauthorizedException when user not found or inactive', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      strategy.validate({ sub: 'u1', email: 'a@b.com', role: 'ADMIN', customRoleId: null, permissions: [], features: [] }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('propagates organizationId and membershipId when present in payload', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1', email: 'a@b.com', role: 'ADMIN',
      customRoleId: null, customRole: null, isActive: true,
    } as never);

    const result = await strategy.validate({
      sub: 'u1', email: 'a@b.com', role: 'ADMIN',
      customRoleId: null, permissions: [], features: [],
      organizationId: 'org-1', membershipId: 'mem-1',
    });
    expect(result.organizationId).toBe('org-1');
    expect(result.membershipId).toBe('mem-1');
    expect(result.isSuperAdmin).toBe(false);
  });

  it('propagates impersonation session id for shadow tokens', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1', email: 'a@b.com', role: 'ADMIN',
      customRoleId: null, customRole: null, isActive: true,
    } as never);

    const result = await strategy.validate({
      sub: 'u1', email: 'a@b.com', role: 'ADMIN',
      customRoleId: null, permissions: [], features: [],
      organizationId: 'org-1',
      membershipId: 'mem-1',
      scope: 'impersonation',
      impersonationSessionId: 'imp-1',
    });

    expect(result.scope).toBe('impersonation');
    expect(result.impersonationSessionId).toBe('imp-1');
  });

  it('rejects non-superadmin token missing organizationId claim (no backward compat window)', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1', email: 'a@b.com', role: 'ADMIN',
      customRoleId: null, customRole: null, isActive: true,
      isSuperAdmin: false,
    } as never);

    await expect(
      strategy.validate({
        sub: 'u1', email: 'a@b.com', role: 'ADMIN',
        customRoleId: null, permissions: [], features: [],
        // no organizationId
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('allows isSuperAdmin=true token without organizationId claim', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'sa1', email: 'sa@b.com', role: 'SUPER_ADMIN', isSuperAdmin: true,
      customRoleId: null, customRole: null, isActive: true,
    } as never);

    const result = await strategy.validate({
      sub: 'sa1', email: 'sa@b.com', role: 'SUPER_ADMIN',
      customRoleId: null, permissions: [], features: [],
      // no organizationId — valid for super-admin
    });
    expect(result.isSuperAdmin).toBe(true);
    expect(result.organizationId).toBeUndefined();
  });

  it('exposes both `id` and `sub` (P0: 36 controller usages of user.sub depend on this)', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-7', email: 'a@b.com', role: 'ADMIN',
      customRoleId: null, customRole: null, isActive: true,
    } as never);

    const result = await strategy.validate({
      sub: 'u-7', email: 'a@b.com', role: 'ADMIN',
      customRoleId: null, permissions: [], features: [],
      organizationId: 'org-x', // required: non-superadmin token must carry org claim
    });

    expect(result.id).toBe('u-7');
    // Without `sub`, controllers reading `user.sub` (admin/organizations,
    // admin/impersonation, mobile/employee/*) write `superAdminUserId: undefined`
    // into audit rows — making the audit log unreliable.
    expect((result as { sub?: string }).sub).toBe('u-7');
  });

  it('propagates membershipRole from JWT payload onto req.user', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1', email: 'a@b.com', role: 'ADMIN',
      customRoleId: null, customRole: null, isActive: true,
    } as never);

    const result = await strategy.validate({
      sub: 'u1', email: 'a@b.com', role: 'ADMIN',
      customRoleId: null, permissions: [], features: [],
      organizationId: 'org-1', membershipId: 'mem-1',
      membershipRole: 'OWNER',
    });
    expect((result as { membershipRole?: string }).membershipRole).toBe('OWNER');
  });

  it('Bug B5: passes membershipRole (not legacy User.role) to CaslAbilityFactory', async () => {
    // Legacy global role says ADMIN; per-org role says RECEPTIONIST.
    // The strategy MUST hand the per-org role to the factory, otherwise a
    // demoted user keeps admin abilities until JWT TTL expiry.
    const module = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: { getOrThrow: jest.fn().mockReturnValue('secret-key') } },
        { provide: PrismaService, useValue: { user: { findUnique: jest.fn().mockResolvedValue({
          id: 'u1', email: 'a@b.com', role: 'ADMIN',
          customRoleId: null, customRole: null, isActive: true,
        }) }, membership: { findFirst: jest.fn().mockResolvedValue({ id: 'm1' }) } } },
        {
          provide: CaslAbilityFactory,
          useValue: { buildForUser: jest.fn().mockReturnValue({ rules: [] }) },
        },
        { provide: ClsService, useValue: makeClsMock() },
      ],
    }).compile();

    const localStrategy = module.get(JwtStrategy);
    const casl = module.get(CaslAbilityFactory) as unknown as { buildForUser: jest.Mock };

    await localStrategy.validate({
      sub: 'u1', email: 'a@b.com', role: 'ADMIN',
      customRoleId: null, permissions: [], features: [],
      organizationId: 'org-1', membershipId: 'mem-1',
      membershipRole: 'RECEPTIONIST',
    });

    expect(casl.buildForUser).toHaveBeenCalledWith(
      expect.objectContaining({ membershipRole: 'RECEPTIONIST', role: 'ADMIN' }),
    );
  });

  it('marks isSuperAdmin true when the DB user has isSuperAdmin=true', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1', email: 'sa@b.com', role: 'SUPER_ADMIN', isSuperAdmin: true,
      customRoleId: null, customRole: null, isActive: true,
    } as never);

    const result = await strategy.validate({
      sub: 'u1', email: 'sa@b.com', role: 'SUPER_ADMIN',
      customRoleId: null, permissions: [], features: [],
    });
    expect(result.isSuperAdmin).toBe(true);
  });
});
