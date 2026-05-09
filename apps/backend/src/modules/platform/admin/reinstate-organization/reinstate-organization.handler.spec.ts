import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ReinstateOrganizationHandler } from './reinstate-organization.handler';
import { PrismaService } from '../../../../infrastructure/database';
import { RedisService } from '../../../../infrastructure/cache';
import { PlatformMailerService } from '../../../../infrastructure/mail';

describe('ReinstateOrganizationHandler', () => {
  let handler: ReinstateOrganizationHandler;
  let orgFindUnique: jest.Mock;
  let orgUpdate: jest.Mock;
  let logCreate: jest.Mock;
  let redisDel: jest.Mock;
  let membershipFindFirst: jest.Mock;
  let sendAccountStatusChanged: jest.Mock;

  beforeEach(async () => {
    orgFindUnique = jest.fn();
    orgUpdate = jest.fn();
    logCreate = jest.fn();
    redisDel = jest.fn().mockResolvedValue(1);
    membershipFindFirst = jest.fn().mockResolvedValue({
      user: { email: 'owner@example.com', name: 'Owner' },
      organization: { nameAr: 'Org AR' },
    });
    sendAccountStatusChanged = jest.fn().mockResolvedValue(undefined);

    const tx = {
      organization: { findUnique: orgFindUnique, update: orgUpdate },
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
        ReinstateOrganizationHandler,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RedisService, useValue: redisMock },
        { provide: PlatformMailerService, useValue: mailerMock },
      ],
    }).compile();

    handler = moduleRef.get(ReinstateOrganizationHandler);
  });

  const cmd = {
    organizationId: 'o1',
    superAdminUserId: 'sa1',
    ipAddress: '1.2.3.4',
    userAgent: 'jest',
  };

  it('reinstates a suspended org and writes audit log', async () => {
    orgFindUnique.mockResolvedValue({ id: 'o1', status: 'SUSPENDED', suspendedAt: new Date() });
    orgUpdate.mockResolvedValue({});
    logCreate.mockResolvedValue({});

    await handler.execute(cmd);

    expect(orgUpdate).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { suspendedAt: null, suspendedReason: null, status: 'ACTIVE' },
    });
    expect(logCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actionType: 'REINSTATE_ORG',
        organizationId: 'o1',
        reason: null,
      }),
    });
  });

  it('invalidates suspension cache after commit', async () => {
    orgFindUnique.mockResolvedValue({ id: 'o1', status: 'SUSPENDED', suspendedAt: new Date() });

    await handler.execute(cmd);

    expect(redisDel).toHaveBeenCalledWith('org-suspension:o1');
  });

  it('throws NotFoundException when org does not exist', async () => {
    orgFindUnique.mockResolvedValue(null);

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws ConflictException when org is not suspended', async () => {
    orgFindUnique.mockResolvedValue({ id: 'o1', status: 'ACTIVE', suspendedAt: null });

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(ConflictException);
    expect(orgUpdate).not.toHaveBeenCalled();
    expect(redisDel).not.toHaveBeenCalled();
  });

  it('throws ConflictException when org is archived', async () => {
    orgFindUnique.mockResolvedValue({ id: 'o1', status: 'ARCHIVED', suspendedAt: new Date() });

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(ConflictException);
    expect(orgUpdate).not.toHaveBeenCalled();
    expect(redisDel).not.toHaveBeenCalled();
  });

  it('sends a REINSTATED account-status-changed email to the org owner', async () => {
    orgFindUnique.mockResolvedValue({ id: 'o1', status: 'SUSPENDED', suspendedAt: new Date() });
    orgUpdate.mockResolvedValue({});
    logCreate.mockResolvedValue({});

    await handler.execute(cmd);

    expect(sendAccountStatusChanged).toHaveBeenCalledWith(
      'owner@example.com',
      expect.objectContaining({ status: 'REINSTATED' }),
    );
  });
});
