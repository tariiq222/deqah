import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SuspendOrganizationHandler } from './suspend-organization.handler';
import { PrismaService } from '../../../../infrastructure/database';
import { RedisService } from '../../../../infrastructure/cache';
import { PlatformMailerService } from '../../../../infrastructure/mail';

describe('SuspendOrganizationHandler', () => {
  let handler: SuspendOrganizationHandler;
  let orgFindUnique: jest.Mock;
  let orgUpdate: jest.Mock;
  let refreshTokenUpdateMany: jest.Mock;
  let impersonationSessionUpdateMany: jest.Mock;
  let logCreate: jest.Mock;
  let redisDel: jest.Mock;
  let membershipFindFirst: jest.Mock;
  let sendAccountStatusChanged: jest.Mock;

  beforeEach(async () => {
    orgFindUnique = jest.fn();
    orgUpdate = jest.fn();
    refreshTokenUpdateMany = jest.fn().mockResolvedValue({ count: 2 });
    impersonationSessionUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    logCreate = jest.fn();
    redisDel = jest.fn().mockResolvedValue(1);
    membershipFindFirst = jest.fn().mockResolvedValue({
      user: { email: 'owner@example.com', name: 'Owner' },
      organization: { nameAr: 'Org AR' },
    });
    sendAccountStatusChanged = jest.fn().mockResolvedValue(undefined);

    const tx = {
      organization: { findUnique: orgFindUnique, update: orgUpdate },
      refreshToken: { updateMany: refreshTokenUpdateMany },
      impersonationSession: { updateMany: impersonationSessionUpdateMany },
      superAdminActionLog: { create: logCreate },
    };

    const prismaMock = {
      $allTenants: {
        $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
        membership: { findFirst: membershipFindFirst },
      },
    } as unknown as PrismaService;

    const redisMock = {
      getClient: () => ({ del: redisDel }),
    } as unknown as RedisService;

    const mailerMock = {
      sendAccountStatusChanged,
    } as unknown as PlatformMailerService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        SuspendOrganizationHandler,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RedisService, useValue: redisMock },
        { provide: PlatformMailerService, useValue: mailerMock },
      ],
    }).compile();

    handler = moduleRef.get(SuspendOrganizationHandler);
  });

  const cmd = {
    organizationId: 'o1',
    superAdminUserId: 'sa1',
    ipAddress: '1.2.3.4',
    userAgent: 'jest',
  };

  it('suspends an active org and writes audit log', async () => {
    orgFindUnique.mockResolvedValue({ id: 'o1', suspendedAt: null });
    orgUpdate.mockResolvedValue({});
    logCreate.mockResolvedValue({});

    await handler.execute(cmd);

    expect(orgUpdate).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: expect.objectContaining({
        suspendedAt: expect.any(Date),
        suspendedReason: null,
        status: 'SUSPENDED',
      }),
    });
    expect(logCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actionType: 'SUSPEND_ORG',
        organizationId: 'o1',
        superAdminUserId: 'sa1',
        reason: null,
        ipAddress: '1.2.3.4',
        metadata: {
          refreshTokensRevoked: 2,
          impersonationSessionsEnded: 1,
        },
      }),
    });
  });

  it('revokes active refresh tokens and ends active impersonation sessions', async () => {
    orgFindUnique.mockResolvedValue({ id: 'o1', suspendedAt: null });

    await handler.execute(cmd);

    expect(refreshTokenUpdateMany).toHaveBeenCalledWith({
      where: { organizationId: 'o1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(impersonationSessionUpdateMany).toHaveBeenCalledWith({
      where: { organizationId: 'o1', endedAt: null },
      data: { endedAt: expect.any(Date), endedReason: 'organization_suspended' },
    });
  });

  it('invalidates suspension cache after commit', async () => {
    orgFindUnique.mockResolvedValue({ id: 'o1', suspendedAt: null });
    orgUpdate.mockResolvedValue({});
    logCreate.mockResolvedValue({});

    await handler.execute(cmd);

    expect(redisDel).toHaveBeenCalledWith('org-suspension:o1');
  });

  it('throws NotFoundException when org does not exist', async () => {
    orgFindUnique.mockResolvedValue(null);

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(NotFoundException);
    expect(orgUpdate).not.toHaveBeenCalled();
    expect(redisDel).not.toHaveBeenCalled();
  });

  it('throws ConflictException when org already suspended', async () => {
    orgFindUnique.mockResolvedValue({ id: 'o1', suspendedAt: new Date() });

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(ConflictException);
    expect(orgUpdate).not.toHaveBeenCalled();
    expect(redisDel).not.toHaveBeenCalled();
  });

  it('sends a SUSPENDED account-status-changed email to the org owner', async () => {
    orgFindUnique.mockResolvedValue({ id: 'o1', suspendedAt: null });
    orgUpdate.mockResolvedValue({});
    logCreate.mockResolvedValue({});

    await handler.execute(cmd);

    expect(sendAccountStatusChanged).toHaveBeenCalledWith(
      'owner@example.com',
      expect.objectContaining({
        status: 'SUSPENDED',
      }),
    );
  });
});
