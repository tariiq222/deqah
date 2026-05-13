import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthController } from './auth.controller';
import { TokenService } from '../../modules/identity/shared/token.service';

const USER_ID = 'user-1';
const TOKEN_PAIR = { accessToken: 'access', refreshToken: 'refresh' };

const fn = <T = unknown>(val: T = {} as T) => ({ execute: jest.fn().mockResolvedValue(val) });

function buildRes(cookies: Record<string, string> = {}) {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    cookies,
  } as unknown as import('express').Response;
}

function buildReq(cookies: Record<string, string> = {}, host = '') {
  return { cookies, headers: { host } } as unknown as import('express').Request;
}

function buildController() {
  const login = fn(TOKEN_PAIR);
  const logout = fn({ success: true });
  const refreshTokenModel = {
    findMany: jest.fn(),
    update: jest.fn(),
  };
  const membershipModel = {
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
  };
  const prisma = {
    refreshToken: refreshTokenModel,
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    membership: membershipModel,
    // /auth/refresh + /auth/logout query through $allTenants because they
    // run before tenant context exists.
    $allTenants: {
      refreshToken: refreshTokenModel,
      membership: membershipModel,
    },
  } as unknown as import('../../infrastructure/database').PrismaService;
  const tokens = {
    issueTokenPair: jest.fn().mockResolvedValue(TOKEN_PAIR),
  } as unknown as TokenService;
  const getCurrentUser = fn();
  const changePassword = fn();
  const listMemberships = fn([]);
  const switchOrganization = fn(TOKEN_PAIR);
  const config = { get: jest.fn().mockReturnValue('15m'), getOrThrow: jest.fn().mockReturnValue('15m') } as never;
  const requestPasswordReset = fn({ ok: true });
  const performPasswordReset = fn({ ok: true });
  const updateMembershipProfile = fn({});
  const uploadMembershipAvatar = fn({ membershipId: 'm-1', membershipAvatarUrl: 'https://m/avatar.jpg' });
  const inviteUser = fn({ invitationId: 'inv-1', status: 'PENDING' as const, expiresAt: new Date() });
  const acceptInvitation = fn({ membershipId: 'm-1', organizationId: 'org-1', userPreExisting: false });
  const tenant = { requireOrganizationId: jest.fn().mockReturnValue('org-1') } as never;
  const requestDashboardOtp = fn({ success: true });
  const verifyDashboardOtp = fn(TOKEN_PAIR);
  const cls = {
    run: jest.fn().mockImplementation(async (fn: () => Promise<unknown>) => fn()),
    set: jest.fn(),
    get: jest.fn(),
  } as never;
  const redisClient = {
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(1),
  };
  const redis = { getClient: jest.fn().mockReturnValue(redisClient) };
  const settings = { get: jest.fn().mockResolvedValue(null) } as never;
  const controller = new AuthController(
    login as never, logout as never, prisma, tokens,
    getCurrentUser as never, changePassword as never,
    listMemberships as never, switchOrganization as never, config,
    requestPasswordReset as never, performPasswordReset as never,
    updateMembershipProfile as never,
    uploadMembershipAvatar as never,
    inviteUser as never, acceptInvitation as never, tenant,
    requestDashboardOtp as never, verifyDashboardOtp as never,
    cls, settings,
  );
  return { controller, login, logout, prisma, tokens, listMemberships, switchOrganization, requestPasswordReset, performPasswordReset, requestDashboardOtp, verifyDashboardOtp };
}

describe('AuthController', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('loginEndpoint', () => {
    it('passes email, password and ip to login handler', async () => {
      const { controller, login } = buildController();
      await controller.loginEndpoint({ email: 'a@b.com', password: 'pass123', hCaptchaToken: 'tok' } as never, '127.0.0.1', buildReq(), buildRes());
      expect(login.execute).toHaveBeenCalledWith({
        email: 'a@b.com',
        password: 'pass123',
        ip: '127.0.0.1',
      });
    });

    it('returns accessToken + expiresIn in body but NOT refreshToken (CR-9: cookie-only)', async () => {
      const { controller } = buildController();
      const result = await controller.loginEndpoint({ email: 'a@b.com', password: 'pass123', hCaptchaToken: 'tok' } as never, '127.0.0.1', buildReq(), buildRes());
      expect(result).toMatchObject({ accessToken: 'access', expiresIn: expect.any(Number) });
      expect(result).not.toHaveProperty('refreshToken');
    });

    it('sets ck_refresh httpOnly cookie on login', async () => {
      const { controller, prisma } = buildController();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: USER_ID, email: 'a@b.com', name: 'Test User', phone: null, gender: null,
        avatarUrl: null, isActive: true, role: 'OWNER', customRoleId: null,
        customRole: { permissions: [] }, createdAt: new Date(), updatedAt: new Date(),
      });
      (prisma.membership.findFirst as jest.Mock).mockResolvedValue({ organizationId: 'org_1' });
      const res = buildRes();
      await controller.loginEndpoint({ email: 'a@b.com', password: 'pass123', hCaptchaToken: 'tok' } as never, '127.0.0.1', buildReq(), res);
      expect(res.cookie).toHaveBeenCalledWith('ck_refresh', 'refresh', expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }));
    });

    it('returns user.firstName/lastName split from name + organizationId from membership', async () => {
      const { controller, prisma } = buildController();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: USER_ID,
        email: 'admin@c.sa',
        name: 'Tariq Al Walidi',
        phone: null,
        gender: null,
        avatarUrl: null,
        isActive: true,
        isSuperAdmin: false,
        role: 'OWNER',
        customRoleId: null,
        customRole: { permissions: [] },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      (prisma.membership.findFirst as jest.Mock).mockResolvedValue({ organizationId: 'org_1' });

      const result = await controller.loginEndpoint({ email: 'admin@c.sa', password: 'pw', hCaptchaToken: 'tok' } as never, '127.0.0.1', buildReq(), buildRes());

      expect(result.user).toMatchObject({
        firstName: 'Tariq',
        lastName: 'Al Walidi',
        organizationId: 'org_1',
        isSuperAdmin: false,
      });
    });

    it('returns organizationId=null when user has no active membership', async () => {
      const { controller, prisma } = buildController();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: USER_ID,
        email: 'a@b.c',
        name: 'Solo',
        phone: null,
        gender: null,
        avatarUrl: null,
        isActive: true,
        role: 'CLIENT',
        customRoleId: null,
        customRole: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      (prisma.membership.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await controller.loginEndpoint({ email: 'a@b.c', password: 'pw', hCaptchaToken: 'tok' } as never, '127.0.0.1', buildReq(), buildRes());

      expect(result.user).toMatchObject({
        firstName: 'Solo',
        lastName: '',
        organizationId: null,
      });
    });
  });

  describe('refreshEndpoint', () => {
    it('finds matching refresh token and issues new tokens', async () => {
      const rawToken = 'raw-refresh';
      const tokenHash = await bcrypt.hash(rawToken, 10);
      const matched = { id: 'rt-1', userId: USER_ID, tokenHash, revokedAt: null, expiresAt: new Date(Date.now() + 60_000) };
      const user = {
        id: USER_ID, email: 'a@b.com', isActive: true,
        customRole: { name: 'admin', permissions: [] },
      };

      const { controller, prisma, tokens } = buildController();
      (prisma.refreshToken.findMany as jest.Mock).mockResolvedValue([matched]);
      (prisma.refreshToken.update as jest.Mock).mockResolvedValue({});
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(user);
      (tokens.issueTokenPair as jest.Mock).mockResolvedValue(TOKEN_PAIR);

      const res = buildRes();
      const result = await controller.refreshEndpoint({ refreshToken: rawToken } as never, buildReq(), res);

      expect(res.cookie).toHaveBeenCalledWith('ck_refresh', 'refresh', expect.objectContaining({ httpOnly: true }));
      expect(prisma.refreshToken.findMany).toHaveBeenCalledWith({
        where: { tokenSelector: rawToken.slice(0, 8), revokedAt: null, expiresAt: { gt: expect.any(Date) } },
      });
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: USER_ID },
        include: { customRole: { include: { permissions: true } } },
      });
      expect(result).toMatchObject({ accessToken: 'access', expiresIn: expect.any(Number) });
      expect(result).not.toHaveProperty('refreshToken');
    });

    it('throws UnauthorizedException when no token matches', async () => {
      const { controller, prisma } = buildController();
      (prisma.refreshToken.findMany as jest.Mock).mockResolvedValue([]);

      await expect(controller.refreshEndpoint({ refreshToken: 'bad' } as never, buildReq(), buildRes()))
        .rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when user not found', async () => {
      const rawToken = 'raw-refresh';
      const tokenHash = await bcrypt.hash(rawToken, 10);
      const matched = { id: 'rt-1', userId: USER_ID, tokenHash, revokedAt: null, expiresAt: new Date(Date.now() + 60_000) };

      const { controller, prisma } = buildController();
      (prisma.refreshToken.findMany as jest.Mock).mockResolvedValue([matched]);
      (prisma.refreshToken.update as jest.Mock).mockResolvedValue({});
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(controller.refreshEndpoint({ refreshToken: rawToken } as never, buildReq(), buildRes()))
        .rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when user is inactive', async () => {
      const rawToken = 'raw-refresh';
      const tokenHash = await bcrypt.hash(rawToken, 10);
      const matched = { id: 'rt-1', userId: USER_ID, tokenHash, revokedAt: null, expiresAt: new Date(Date.now() + 60_000) };
      const user = { id: USER_ID, email: 'a@b.com', isActive: false };

      const { controller, prisma } = buildController();
      (prisma.refreshToken.findMany as jest.Mock).mockResolvedValue([matched]);
      (prisma.refreshToken.update as jest.Mock).mockResolvedValue({});
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(user);

      await expect(controller.refreshEndpoint({ refreshToken: rawToken } as never, buildReq(), buildRes()))
        .rejects.toThrow(UnauthorizedException);
    });

    it('reads refresh token from ck_refresh cookie (preferred over body)', async () => {
      const rawToken = 'cookie-raw-token';
      const tokenHash = await bcrypt.hash(rawToken, 10);
      const matched = { id: 'rt-2', userId: USER_ID, tokenHash, revokedAt: null, expiresAt: new Date(Date.now() + 60_000) };
      const user = { id: USER_ID, email: 'a@b.com', isActive: true, customRole: { name: 'admin', permissions: [] } };

      const { controller, prisma, tokens } = buildController();
      (prisma.refreshToken.findMany as jest.Mock).mockResolvedValue([matched]);
      (prisma.refreshToken.update as jest.Mock).mockResolvedValue({});
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(user);
      (tokens.issueTokenPair as jest.Mock).mockResolvedValue(TOKEN_PAIR);

      await controller.refreshEndpoint(
        { refreshToken: 'stale-body-token' } as never,
        buildReq({ ck_refresh: rawToken }),
        buildRes(),
      );

      expect(prisma.refreshToken.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tokenSelector: rawToken.slice(0, 8) }) }),
      );
    });
  });

  describe('logoutEndpoint', () => {
    it('finds matching refresh token and calls logout handler', async () => {
      const rawToken = 'raw-refresh';
      const tokenHash = await bcrypt.hash(rawToken, 10);
      const matched = { id: 'rt-1', userId: USER_ID, tokenHash, revokedAt: null, expiresAt: new Date(Date.now() + 60_000) };

      const { controller, logout, prisma } = buildController();
      (prisma.refreshToken.findMany as jest.Mock).mockResolvedValue([matched]);

      await controller.logoutEndpoint({ refreshToken: rawToken } as never, buildReq(), buildRes());

      expect(logout.execute).toHaveBeenCalledWith({
        userId: USER_ID,
      });
    });

    it('clears ck_refresh cookie on logout', async () => {
      const rawToken = 'raw-refresh';
      const tokenHash = await bcrypt.hash(rawToken, 10);
      const matched = { id: 'rt-1', userId: USER_ID, tokenHash, revokedAt: null, expiresAt: new Date(Date.now() + 60_000) };

      const { controller, prisma } = buildController();
      (prisma.refreshToken.findMany as jest.Mock).mockResolvedValue([matched]);
      const res = buildRes();

      await controller.logoutEndpoint({ refreshToken: rawToken } as never, buildReq(), res);

      expect(res.clearCookie).toHaveBeenCalledWith('ck_refresh', { path: '/' });
    });

    it('clears cookie and returns silently when no token is present', async () => {
      const { controller } = buildController();
      const res = buildRes();

      await expect(controller.logoutEndpoint({} as never, buildReq(), res)).resolves.toBeUndefined();
      expect(res.clearCookie).toHaveBeenCalledWith('ck_refresh', { path: '/' });
    });

    it('throws UnauthorizedException when no token matches', async () => {
      const { controller, prisma } = buildController();
      (prisma.refreshToken.findMany as jest.Mock).mockResolvedValue([]);

      await expect(controller.logoutEndpoint({ refreshToken: 'bad' } as never, buildReq(), buildRes()))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  describe('membershipsEndpoint (SaaS-06)', () => {
    it('forwards userId to ListMembershipsHandler', async () => {
      const { controller, listMemberships } = buildController();
      listMemberships.execute.mockResolvedValue([{ id: 'm1' }]);

      const result = await controller.membershipsEndpoint(USER_ID);

      expect(listMemberships.execute).toHaveBeenCalledWith({ userId: USER_ID });
      expect(result).toEqual([{ id: 'm1' }]);
    });
  });

  describe('switchOrgEndpoint (SaaS-06)', () => {
    it('returns accessToken + expiresIn in body but NOT refreshToken (CR-9: cookie-only)', async () => {
      const { controller, switchOrganization } = buildController();
      const res = buildRes();

      const result = await controller.switchOrgEndpoint(
        USER_ID,
        { organizationId: 'org-b' } as never,
        res,
      );

      expect(switchOrganization.execute).toHaveBeenCalledWith({
        userId: USER_ID,
        targetOrganizationId: 'org-b',
      });
      expect(result).toEqual({
        accessToken: 'access',
        expiresIn: 900,
      });
      expect(result).not.toHaveProperty('refreshToken');
    });

    it('sets ck_refresh httpOnly cookie on org switch (CR-9)', async () => {
      const { controller } = buildController();
      const res = buildRes();

      await controller.switchOrgEndpoint(
        USER_ID,
        { organizationId: 'org-b' } as never,
        res,
      );

      expect(res.cookie).toHaveBeenCalledWith('ck_refresh', 'refresh', expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }));
    });
  });
});
