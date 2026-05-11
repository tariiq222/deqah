import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { RefreshTokenHandler } from './refresh-token.handler';
import { TokenService } from '../shared/token.service';
import { PrismaService } from '../../../infrastructure/database';
import { DEFAULT_ORGANIZATION_ID } from '../../../common/tenant';

describe('RefreshTokenHandler', () => {
  let handler: RefreshTokenHandler;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tokenService: any;

  const futureDate = new Date(Date.now() + 86400000);

  // UUID-shaped token so slice(0,8) produces a valid selector
  const RAW_TOKEN = '12345678-abcd-4000-aaaa-000000000001';
  const SELECTOR = RAW_TOKEN.slice(0, 8); // '12345678'

  const baseToken = {
    id: 'rt-1',
    userId: 'user-1',
    organizationId: 'org-A',
    tokenHash: '$2b$10$abc',
    expiresAt: futureDate,
    revokedAt: null,
    createdAt: new Date(),
    tokenSelector: SELECTOR,
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RefreshTokenHandler,
        {
          provide: PrismaService,
          useValue: {
            refreshToken: {
              findFirst: jest.fn(),
              findMany: jest.fn(),
              updateMany: jest.fn(),
            },
            user: { findUnique: jest.fn() },
            membership: { findUnique: jest.fn().mockResolvedValue({ id: 'mem-1', role: 'ADMIN' }) },
          },
        },
        { provide: TokenService, useValue: { issueTokenPair: jest.fn() } },
      ],
    }).compile();

    handler = module.get(RefreshTokenHandler);
    prisma = module.get(PrismaService);
    tokenService = module.get(TokenService);
  });

  it('issues new token pair when refresh token is valid (fast path)', async () => {
    prisma.refreshToken.findFirst.mockResolvedValue(baseToken);
    jest.spyOn(require('bcryptjs'), 'compare').mockResolvedValue(true);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com', role: 'ADMIN', customRoleId: null, customRole: null, isActive: true });
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    tokenService.issueTokenPair.mockResolvedValue({ accessToken: 'new-acc', refreshToken: 'new-ref' });

    const result = await handler.execute({ userId: 'user-1', rawToken: RAW_TOKEN });
    expect(result.accessToken).toBe('new-acc');
    expect(result.refreshToken).toBe('new-ref');
    // Must use findFirst with selector, NOT a full table scan
    expect(prisma.refreshToken.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tokenSelector: SELECTOR }) }),
    );
    expect(prisma.refreshToken.findMany).not.toHaveBeenCalled();
  });

  it('ROTATION: old refresh token is revoked when used to get new tokens', async () => {
    prisma.refreshToken.findFirst.mockResolvedValue({ ...baseToken, id: 'rt-old' });
    jest.spyOn(require('bcryptjs'), 'compare').mockResolvedValue(true);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com', role: 'ADMIN', customRoleId: null, customRole: null, isActive: true });
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    tokenService.issueTokenPair.mockResolvedValue({ accessToken: 'new-acc', refreshToken: 'new-ref' });

    await handler.execute({ userId: 'user-1', rawToken: RAW_TOKEN });

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'rt-old', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('ROTATION: stolen old refresh token cannot be reused after rotation', async () => {
    prisma.refreshToken.findFirst.mockResolvedValue(baseToken);
    jest.spyOn(require('bcryptjs'), 'compare').mockResolvedValue(true);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com', role: 'ADMIN', customRoleId: null, customRole: null, isActive: true });
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    tokenService.issueTokenPair.mockResolvedValue({ accessToken: 'new-acc', refreshToken: 'new-ref' });

    await handler.execute({ userId: 'user-1', rawToken: RAW_TOKEN });

    // Simulate attacker trying to use the OLD token after rotation —
    // DB returns null because revokedAt is now set (filtered by the where clause).
    prisma.refreshToken.findFirst.mockResolvedValue(null);
    prisma.refreshToken.findMany.mockResolvedValue([]);

    await expect(
      handler.execute({ userId: 'user-1', rawToken: RAW_TOKEN }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when no valid token found (no DB match)', async () => {
    // Both fast and legacy paths return empty — handler must throw.
    prisma.refreshToken.findFirst.mockResolvedValue(null);
    prisma.refreshToken.findMany.mockResolvedValue([]); // legacy fallback also empty
    await expect(
      handler.execute({ userId: 'user-1', rawToken: RAW_TOKEN }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws immediately when selector matches but bcrypt fails (fast-fail, no legacy scan)', async () => {
    // findFirst returns a candidate (selector hit) but bcrypt comparison fails.
    // The handler must throw WITHOUT falling through to the O(n) findMany scan.
    prisma.refreshToken.findFirst.mockResolvedValue(baseToken);
    jest.spyOn(require('bcryptjs'), 'compare').mockResolvedValue(false);

    await expect(
      handler.execute({ userId: 'user-1', rawToken: RAW_TOKEN }),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.refreshToken.findMany).not.toHaveBeenCalled();
  });

  it('rejects when token was already revoked between findFirst and updateMany (rotation race)', async () => {
    // Simulates: T1 reads token, T2 reads token, T2 revokes, T1 attempts revoke
    // → T1's updateMany sees revokedAt!=null and returns count=0.
    prisma.refreshToken.findFirst.mockResolvedValue(baseToken);
    jest.spyOn(require('bcryptjs'), 'compare').mockResolvedValue(true);
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      handler.execute({ userId: 'user-1', rawToken: RAW_TOKEN }),
    ).rejects.toThrow(UnauthorizedException);
    expect(tokenService.issueTokenPair).not.toHaveBeenCalled();
  });

  it('carries organizationId from old refresh token into new token pair', async () => {
    prisma.refreshToken.findFirst.mockResolvedValue(baseToken);
    jest.spyOn(require('bcryptjs'), 'compare').mockResolvedValue(true);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com', role: 'RECEPTIONIST', customRoleId: null, customRole: null, isActive: true });
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    tokenService.issueTokenPair.mockResolvedValue({ accessToken: 'new-acc', refreshToken: 'new-ref' });

    await handler.execute({ userId: 'user-1', rawToken: RAW_TOKEN });

    expect(tokenService.issueTokenPair).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1' }),
      expect.objectContaining({ organizationId: 'org-A', isSuperAdmin: false }),
    );
  });

  it('falls back to DEFAULT_ORGANIZATION_ID when old token has no organizationId', async () => {
    prisma.refreshToken.findFirst.mockResolvedValue({ ...baseToken, organizationId: null });
    jest.spyOn(require('bcryptjs'), 'compare').mockResolvedValue(true);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com', role: 'RECEPTIONIST', customRoleId: null, customRole: null, isActive: true });
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    tokenService.issueTokenPair.mockResolvedValue({ accessToken: 'new-acc', refreshToken: 'new-ref' });

    await handler.execute({ userId: 'user-1', rawToken: RAW_TOKEN });

    expect(tokenService.issueTokenPair).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ organizationId: DEFAULT_ORGANIZATION_ID }),
    );
  });

  it('marks isSuperAdmin=true when user.isSuperAdmin is true', async () => {
    prisma.refreshToken.findFirst.mockResolvedValue(baseToken);
    jest.spyOn(require('bcryptjs'), 'compare').mockResolvedValue(true);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com', role: 'SUPER_ADMIN', isSuperAdmin: true, customRoleId: null, customRole: null, isActive: true });
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    tokenService.issueTokenPair.mockResolvedValue({ accessToken: 'new-acc', refreshToken: 'new-ref' });

    await handler.execute({ userId: 'user-1', rawToken: RAW_TOKEN });

    expect(tokenService.issueTokenPair).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ isSuperAdmin: true }),
    );
  });

  it('falls back to legacy O(n) scan for tokens without a valid selector', async () => {
    // Token shorter than 8 chars → no selector path → falls back to findMany
    const legacyToken = 'short';
    prisma.refreshToken.findMany.mockResolvedValue([
      { ...baseToken, tokenSelector: null },
    ]);
    jest.spyOn(require('bcryptjs'), 'compare').mockResolvedValue(true);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com', role: 'ADMIN', customRoleId: null, customRole: null, isActive: true });
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    tokenService.issueTokenPair.mockResolvedValue({ accessToken: 'new-acc', refreshToken: 'new-ref' });

    const result = await handler.execute({ userId: 'user-1', rawToken: legacyToken });
    expect(result.accessToken).toBe('new-acc');
    expect(prisma.refreshToken.findMany).toHaveBeenCalled();
  });
});
