import { Test } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { SwitchOrganizationHandler } from './switch-organization.handler';
import { PrismaService } from '../../../infrastructure/database';
import { TokenService } from '../shared/token.service';

const userBase = {
  id: 'user-1',
  email: 'u@c.sa',
  role: 'ADMIN',
  customRoleId: null,
  customRole: null,
  isActive: true,
  passwordHash: 'x',
};

describe('SwitchOrganizationHandler', () => {
  let handler: SwitchOrganizationHandler;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let tokens: jest.Mocked<TokenService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SwitchOrganizationHandler,
        {
          provide: PrismaService,
          useValue: {
            membership: { findUnique: jest.fn() },
            user: {
              findUnique: jest.fn(),
              update: jest.fn().mockResolvedValue({}),
            },
            refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
          } as unknown as PrismaService,
        },
        {
          provide: TokenService,
          useValue: {
            issueTokenPair: jest
              .fn()
              .mockResolvedValue({ accessToken: 'acc', refreshToken: 'ref' }),
          },
        },
      ],
    }).compile();

    handler = module.get(SwitchOrganizationHandler);
    prisma = module.get(PrismaService);
    tokens = module.get(TokenService);
  });

  it('issues a fresh token pair with the target org claims', async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: 'm-2',
      organizationId: 'org-b',
      isActive: true,
      role: undefined,
      organization: { status: 'ACTIVE' },
    });
    prisma.user.findUnique.mockResolvedValue(userBase);

    const result = await handler.execute({
      userId: 'user-1',
      targetOrganizationId: 'org-b',
    });

    expect(result).toEqual({ accessToken: 'acc', refreshToken: 'ref' });
    expect(tokens.issueTokenPair).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1' }),
      expect.objectContaining({ organizationId: 'org-b', membershipId: 'm-2', isSuperAdmin: false }),
    );
  });

  it('throws ForbiddenException when no membership exists', async () => {
    prisma.membership.findUnique.mockResolvedValue(null);
    await expect(
      handler.execute({ userId: 'user-1', targetOrganizationId: 'org-x' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when membership is inactive', async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: 'm-3',
      organizationId: 'org-c',
      isActive: false,
      organization: { status: 'ACTIVE' },
    });
    await expect(
      handler.execute({ userId: 'user-1', targetOrganizationId: 'org-c' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws UnauthorizedException when user is inactive', async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: 'm-4',
      organizationId: 'org-d',
      isActive: true,
      organization: { status: 'ACTIVE' },
    });
    prisma.user.findUnique.mockResolvedValue({ ...userBase, isActive: false });

    await expect(
      handler.execute({ userId: 'user-1', targetOrganizationId: 'org-d' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('revokes all active refresh tokens before issuing a new pair', async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: 'm-6',
      organizationId: 'org-f',
      isActive: true,
      organization: { status: 'ACTIVE' },
    });
    prisma.user.findUnique.mockResolvedValue(userBase);

    await handler.execute({ userId: 'user-1', targetOrganizationId: 'org-f' });

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(tokens.issueTokenPair).toHaveBeenCalled();
  });

  it('persists target org as User.lastActiveOrganizationId (sticky-org)', async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: 'm-7',
      organizationId: 'org-g',
      isActive: true,
      organization: { status: 'ACTIVE' },
    });
    prisma.user.findUnique.mockResolvedValue(userBase);

    await handler.execute({ userId: 'user-1', targetOrganizationId: 'org-g' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { lastActiveOrganizationId: 'org-g', tokenVersion: { increment: 1 } },
    });
  });

  it('propagates SUPER_ADMIN flag', async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: 'm-5',
      organizationId: 'org-e',
      isActive: true,
      organization: { status: 'ACTIVE' },
    });
    prisma.user.findUnique.mockResolvedValue({ ...userBase, isSuperAdmin: true });

    await handler.execute({ userId: 'user-1', targetOrganizationId: 'org-e' });
    expect(tokens.issueTokenPair).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ isSuperAdmin: true }),
    );
  });
});
