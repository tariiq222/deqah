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

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RefreshTokenHandler,
        {
          provide: PrismaService,
          useValue: {
            refreshToken: { findMany: jest.fn(), updateMany: jest.fn() },
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

  it('issues new token pair when refresh token is valid', async () => {
    prisma.refreshToken.findMany.mockResolvedValue([
      { id: 'rt-1', userId: 'user-1', organizationId: 'org-A', tokenHash: '$2b$10$abc', expiresAt: futureDate, revokedAt: null, createdAt: new Date() },
    ]);
    jest.spyOn(require('bcryptjs'), 'compare').mockResolvedValue(true);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com', role: 'ADMIN', customRoleId: null, customRole: null, isActive: true });
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    tokenService.issueTokenPair.mockResolvedValue({ accessToken: 'new-acc', refreshToken: 'new-ref' });

    const result = await handler.execute({ userId: 'user-1', rawToken: 'raw' });
    expect(result.accessToken).toBe('new-acc');
  });

  it('throws UnauthorizedException when no valid token found', async () => {
    prisma.refreshToken.findMany.mockResolvedValue([]);
    await expect(
      handler.execute({ userId: 'user-1', rawToken: 'bad' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when token was already revoked between findMany and updateMany (rotation race)', async () => {
    // Simulates: T1 reads token, T2 reads token, T2 revokes, T1 attempts revoke
    // → T1's updateMany sees revokedAt!=null and returns count=0.
    prisma.refreshToken.findMany.mockResolvedValue([
      { id: 'rt-1', userId: 'user-1', organizationId: 'org-A', tokenHash: '$2b$10$abc', expiresAt: futureDate, revokedAt: null, createdAt: new Date() },
    ]);
    jest.spyOn(require('bcryptjs'), 'compare').mockResolvedValue(true);
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      handler.execute({ userId: 'user-1', rawToken: 'raw' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(tokenService.issueTokenPair).not.toHaveBeenCalled();
  });

  it('carries organizationId from old refresh token into new token pair', async () => {
    prisma.refreshToken.findMany.mockResolvedValue([
      { id: 'rt-1', userId: 'user-1', organizationId: 'org-A', tokenHash: '$2b$10$abc', expiresAt: futureDate, revokedAt: null, createdAt: new Date() },
    ]);
    jest.spyOn(require('bcryptjs'), 'compare').mockResolvedValue(true);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com', role: 'RECEPTIONIST', customRoleId: null, customRole: null, isActive: true });
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    tokenService.issueTokenPair.mockResolvedValue({ accessToken: 'new-acc', refreshToken: 'new-ref' });

    await handler.execute({ userId: 'user-1', rawToken: 'raw' });

    expect(tokenService.issueTokenPair).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1' }),
      expect.objectContaining({ organizationId: 'org-A', isSuperAdmin: false }),
    );
  });

  it('falls back to DEFAULT_ORGANIZATION_ID when old token has no organizationId', async () => {
    prisma.refreshToken.findMany.mockResolvedValue([
      { id: 'rt-1', userId: 'user-1', organizationId: null, tokenHash: '$2b$10$abc', expiresAt: futureDate, revokedAt: null, createdAt: new Date() },
    ]);
    jest.spyOn(require('bcryptjs'), 'compare').mockResolvedValue(true);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com', role: 'RECEPTIONIST', customRoleId: null, customRole: null, isActive: true });
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    tokenService.issueTokenPair.mockResolvedValue({ accessToken: 'new-acc', refreshToken: 'new-ref' });

    await handler.execute({ userId: 'user-1', rawToken: 'raw' });

    expect(tokenService.issueTokenPair).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ organizationId: DEFAULT_ORGANIZATION_ID }),
    );
  });

  it('marks isSuperAdmin=true when user.isSuperAdmin is true', async () => {
    prisma.refreshToken.findMany.mockResolvedValue([
      { id: 'rt-1', userId: 'user-1', organizationId: 'org-A', tokenHash: '$2b$10$abc', expiresAt: futureDate, revokedAt: null, createdAt: new Date() },
    ]);
    jest.spyOn(require('bcryptjs'), 'compare').mockResolvedValue(true);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com', role: 'SUPER_ADMIN', isSuperAdmin: true, customRoleId: null, customRole: null, isActive: true });
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    tokenService.issueTokenPair.mockResolvedValue({ accessToken: 'new-acc', refreshToken: 'new-ref' });

    await handler.execute({ userId: 'user-1', rawToken: 'raw' });

    expect(tokenService.issueTokenPair).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ isSuperAdmin: true }),
    );
  });
});
