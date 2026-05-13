import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { LoginHandler } from './login.handler';
import { PasswordService } from '../shared/password.service';
import { TokenService } from '../shared/token.service';
import { PrismaService } from '../../../infrastructure/database';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { RlsHelper } from '../../../common/tenant';

const ORG_A = '00000000-0000-0000-0000-000000000001';
const ORG_B = '00000000-0000-0000-0000-000000000002';

const mockUser = {
  id: 'user-1',
  email: 'admin@clinic.sa',
  passwordHash: '$2b$10$hashed',
  name: 'Admin',
  phone: null,
  gender: null,
  avatarUrl: null,
  isActive: true,
  role: 'ADMIN',
  customRoleId: null,
  customRole: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  failedLoginAttempts: 0,
  lockedUntil: null,
  isSuperAdmin: false,
  lastActiveOrganizationId: null,
};

const makeMembership = (orgId: string, role = 'ADMIN') => ({
  id: `mem-${orgId}`,
  organizationId: orgId,
  role,
  organization: { nameAr: `عيادة ${orgId}`, nameEn: `Clinic ${orgId}`, slug: `clinic-${orgId}` },
});

describe('LoginHandler', () => {
  let handler: LoginHandler;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let passwordService: jest.Mocked<PasswordService>;
  let tokenService: jest.Mocked<TokenService>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockTx: any;
  let redisClient: { incr: jest.Mock; expire: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    redisClient = {
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(1),
    };
    const redisService = {
      getClient: jest.fn().mockReturnValue(redisClient),
    };
    mockTx = { membership: { findMany: jest.fn().mockResolvedValue([]) } };
    const module = await Test.createTestingModule({
      providers: [
        LoginHandler,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
          } as unknown as PrismaService,
        },
        { provide: PasswordService, useValue: { verify: jest.fn() } },
        {
          provide: TokenService,
          useValue: {
            issueTokenPair: jest.fn().mockResolvedValue({ accessToken: 'acc', refreshToken: 'ref' }),
          },
        },
        {
          provide: RlsHelper,
          useValue: {
            runWithoutTenant: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
          },
        },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    handler = module.get(LoginHandler);
    prisma = module.get(PrismaService);
    passwordService = module.get(PasswordService);
    tokenService = module.get(TokenService);
  });

  it('returns token pair for valid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser as never);
    passwordService.verify.mockResolvedValue(true);
    tokenService.issueTokenPair.mockResolvedValue({ accessToken: 'acc', refreshToken: 'ref' });
    mockTx.membership.findMany.mockResolvedValue([makeMembership(ORG_A)]);

    const result = await handler.execute({ email: 'admin@clinic.sa', password: 'secret' });
    expect('accessToken' in result && result.accessToken).toBe('acc');
    expect('refreshToken' in result && result.refreshToken).toBe('ref');
  });

  it('throws UnauthorizedException when user not found', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      handler.execute({ email: 'x@y.com', password: 'p' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when password wrong', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser as never);
    passwordService.verify.mockResolvedValue(false);
    await expect(
      handler.execute({ email: 'admin@clinic.sa', password: 'wrong' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when user is inactive', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...mockUser, isActive: false } as never);
    passwordService.verify.mockResolvedValue(true);
    await expect(
      handler.execute({ email: 'admin@clinic.sa', password: 'secret' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects users with null passwordHash (mobile-only accounts)', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...mockUser, passwordHash: null } as never);
    await expect(
      handler.execute({ email: 'a@b.com', password: 'whatever' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  describe('SaaS-01 tenant claims', () => {
    it('passes the active membership to TokenService.issueTokenPair', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, lastActiveOrganizationId: null } as never);
      passwordService.verify.mockResolvedValue(true);
      mockTx.membership.findMany.mockResolvedValue([makeMembership(ORG_A)]);

      await handler.execute({ email: 'admin@clinic.sa', password: 'secret' });

      expect(tokenService.issueTokenPair).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-1' }),
        expect.objectContaining({
          organizationId: ORG_A,
          membershipId: `mem-${ORG_A}`,
          membershipRole: 'ADMIN',
          isSuperAdmin: false,
        }),
      );
    });

    it('throws when non-superadmin user has no membership row', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, lastActiveOrganizationId: null } as never);
      passwordService.verify.mockResolvedValue(true);
      mockTx.membership.findMany.mockResolvedValue([]);

      await expect(
        handler.execute({ email: 'admin@clinic.sa', password: 'secret' }),
      ).rejects.toThrow('No active membership found for this account');
    });

    it('marks isSuperAdmin true when user.isSuperAdmin is true', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, isSuperAdmin: true, lastActiveOrganizationId: null } as never);
      passwordService.verify.mockResolvedValue(true);
      mockTx.membership.findMany.mockResolvedValue([]);

      await handler.execute({ email: 'admin@clinic.sa', password: 'secret' });

      expect(tokenService.issueTokenPair).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ isSuperAdmin: true }),
      );
    });
  });

  describe('multi-org login flow', () => {
    it('branch 1: zero active memberships → Unauthorized', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser } as never);
      passwordService.verify.mockResolvedValue(true);
      mockTx.membership.findMany.mockResolvedValue([]);

      await expect(
        handler.execute({ email: 'admin@clinic.sa', password: 'secret' }),
      ).rejects.toThrow('No active membership found for this account');
    });

    it('branch 2: one active membership → success (no org hint needed)', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser } as never);
      passwordService.verify.mockResolvedValue(true);
      mockTx.membership.findMany.mockResolvedValue([makeMembership(ORG_A)]);

      const result = await handler.execute({ email: 'admin@clinic.sa', password: 'secret' });

      expect(tokenService.issueTokenPair).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ organizationId: ORG_A, isSuperAdmin: false }),
      );
      expect(result).toEqual({ accessToken: 'acc', refreshToken: 'ref' });
    });

    it('branch 3: multi-org, valid organizationId provided → tokens for that org', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser } as never);
      passwordService.verify.mockResolvedValue(true);
      mockTx.membership.findMany.mockResolvedValue([
        makeMembership(ORG_A),
        makeMembership(ORG_B),
      ]);

      const result = await handler.execute({
        email: 'admin@clinic.sa',
        password: 'secret',
        organizationId: ORG_B,
      });

      expect(tokenService.issueTokenPair).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ organizationId: ORG_B }),
      );
      expect(result).toEqual({ accessToken: 'acc', refreshToken: 'ref' });
    });

    it('branch 4: multi-org, organizationId provided but user has no membership there → Unauthorized', async () => {
      const ORG_UNKNOWN = '00000000-0000-0000-0000-000000000099';
      prisma.user.findUnique.mockResolvedValue({ ...mockUser } as never);
      passwordService.verify.mockResolvedValue(true);
      mockTx.membership.findMany.mockResolvedValue([
        makeMembership(ORG_A),
        makeMembership(ORG_B),
      ]);

      await expect(
        handler.execute({
          email: 'admin@clinic.sa',
          password: 'secret',
          organizationId: ORG_UNKNOWN,
        }),
      ).rejects.toThrow('No active membership found for the requested organization');
    });

    it('branch 5: multi-org, no organizationId, lastActiveOrganizationId matches → tokens for sticky org', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        lastActiveOrganizationId: ORG_B,
      } as never);
      passwordService.verify.mockResolvedValue(true);
      mockTx.membership.findMany.mockResolvedValue([
        makeMembership(ORG_A),
        makeMembership(ORG_B),
      ]);

      const result = await handler.execute({ email: 'admin@clinic.sa', password: 'secret' });

      expect(tokenService.issueTokenPair).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ organizationId: ORG_B }),
      );
      expect(result).toEqual({ accessToken: 'acc', refreshToken: 'ref' });
    });

    it('branch 6: multi-org, no organizationId, no lastActiveOrganizationId → requires_org_selection', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, lastActiveOrganizationId: null } as never);
      passwordService.verify.mockResolvedValue(true);
      mockTx.membership.findMany.mockResolvedValue([
        makeMembership(ORG_A),
        makeMembership(ORG_B),
      ]);

      const result = await handler.execute({ email: 'admin@clinic.sa', password: 'secret' });

      expect(tokenService.issueTokenPair).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        requires_org_selection: true,
        memberships: expect.arrayContaining([
          expect.objectContaining({ organizationId: ORG_A }),
          expect.objectContaining({ organizationId: ORG_B }),
        ]),
      });
      // Confirm no tokens are issued
      expect('accessToken' in result).toBe(false);
    });
  });

  describe('per-account login lockout', () => {
    it('rejects login when account is locked', async () => {
      const futureDate = new Date(Date.now() + 10 * 60 * 1000);
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        lockedUntil: futureDate,
        failedLoginAttempts: 0,
      } as never);

      await expect(
        handler.execute({ email: 'admin@clinic.sa', password: 'correct' }),
      ).rejects.toThrow(new UnauthorizedException('Account locked. Try again later.'));

      // Must NOT call password.verify — short-circuits before bcrypt
      expect(passwordService.verify).not.toHaveBeenCalled();
    });

    it('increments failedLoginAttempts on bad password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        failedLoginAttempts: 2,
      } as never);
      passwordService.verify.mockResolvedValue(false);

      await expect(
        handler.execute({ email: 'admin@clinic.sa', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ failedLoginAttempts: 3 }),
        }),
      );
    });

    it('locks account after 5 failed attempts and resets counter', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        failedLoginAttempts: 4,
      } as never);
      passwordService.verify.mockResolvedValue(false);

      await expect(
        handler.execute({ email: 'admin@clinic.sa', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);

      // Counter resets to 0 and lockedUntil is set
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            failedLoginAttempts: 0,
            lockedUntil: expect.any(Date),
          }),
        }),
      );
    });

    it('resets failedLoginAttempts and lockedUntil on successful login', async () => {
      const pastDate = new Date(Date.now() - 1000); // expired lock
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        failedLoginAttempts: 3,
        lockedUntil: pastDate,
      } as never);
      passwordService.verify.mockResolvedValue(true);
      mockTx.membership.findMany.mockResolvedValue([makeMembership(ORG_A)]);

      await handler.execute({ email: 'admin@clinic.sa', password: 'correct' });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: { failedLoginAttempts: 0, lockedUntil: null },
        }),
      );
    });
  });
});
