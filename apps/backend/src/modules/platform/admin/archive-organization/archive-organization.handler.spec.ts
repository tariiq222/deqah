import { ConflictException, NotFoundException } from '@nestjs/common';
import { ArchiveOrganizationHandler } from './archive-organization.handler';

describe('ArchiveOrganizationHandler', () => {
  const tx = {
    organization: { findUnique: jest.fn(), update: jest.fn() },
    refreshToken: { updateMany: jest.fn() },
    impersonationSession: { updateMany: jest.fn() },
    superAdminActionLog: { create: jest.fn() },
  };
  const redisDel = jest.fn();
  const prisma = {
    $allTenants: {
      $transaction: jest.fn(async (fn: (arg: typeof tx) => unknown) => fn(tx)),
    },
  };
  const redis = {
    getClient: () => ({ del: redisDel }),
  };
  const handler = new ArchiveOrganizationHandler(prisma as never, redis as never);

  const cmd = {
    organizationId: 'org-1',
    superAdminUserId: 'sa-1',
    reason: 'Archive inactive tenant',
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tx.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      status: 'ACTIVE',
      suspendedAt: null,
    });
    tx.organization.update.mockResolvedValue({
      id: 'org-1',
      status: 'ARCHIVED',
      suspendedAt: new Date(),
      suspendedReason: cmd.reason,
    });
    tx.refreshToken.updateMany.mockResolvedValue({ count: 2 });
    tx.impersonationSession.updateMany.mockResolvedValue({ count: 1 });
  });

  it('cannot archive a missing organization', async () => {
    tx.organization.findUnique.mockResolvedValue(null);

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.organization.update).not.toHaveBeenCalled();
    expect(redisDel).not.toHaveBeenCalled();
  });

  it('cannot archive an already archived organization', async () => {
    tx.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      status: 'ARCHIVED',
      suspendedAt: new Date(),
    });

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.organization.update).not.toHaveBeenCalled();
    expect(redisDel).not.toHaveBeenCalled();
  });

  it('sets status ARCHIVED, suspendedAt, and suspendedReason', async () => {
    await handler.execute(cmd);

    expect(tx.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: expect.objectContaining({
        status: 'ARCHIVED',
        suspendedAt: expect.any(Date),
        suspendedReason: null,
      }),
      select: expect.any(Object),
    });
  });

  it('revokes refresh tokens and ends active impersonation sessions', async () => {
    await handler.execute(cmd);

    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(tx.impersonationSession.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', endedAt: null },
      data: { endedAt: expect.any(Date), endedReason: 'organization_archived' },
    });
  });

  it('writes audit log and clears suspension cache', async () => {
    await handler.execute(cmd);

    expect(tx.superAdminActionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actionType: 'TENANT_ARCHIVE',
        organizationId: 'org-1',
        reason: null,
        metadata: {
          previousStatus: 'ACTIVE',
          refreshTokensRevoked: 2,
          impersonationSessionsEnded: 1,
        },
      }),
    });
    expect(redisDel).toHaveBeenCalledWith('org-suspension:org-1');
  });
});
