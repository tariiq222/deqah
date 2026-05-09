import { NotFoundException } from '@nestjs/common';
import { UpdateOrganizationHandler } from './update-organization.handler';

describe('UpdateOrganizationHandler', () => {
  const tx = {
    organization: { findUnique: jest.fn(), update: jest.fn() },
    vertical: { findFirst: jest.fn() },
    superAdminActionLog: { create: jest.fn() },
  };
  const prisma = {
    $allTenants: {
      $transaction: jest.fn(async (fn: (arg: typeof tx) => unknown) => fn(tx)),
    },
  };
  const handler = new UpdateOrganizationHandler(prisma as never);

  const current = {
    id: 'org-1',
    nameAr: 'قديم',
    nameEn: 'Old',
    verticalId: 'vertical-old',
    trialEndsAt: null,
  };

  const cmd = {
    organizationId: 'org-1',
    nameAr: 'جديد',
    nameEn: 'New',
    verticalSlug: 'clinic',
    trialEndsAt: new Date('2026-05-10T00:00:00.000Z'),
    superAdminUserId: 'sa-1',
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tx.organization.findUnique.mockResolvedValue(current);
    tx.vertical.findFirst.mockResolvedValue({ id: 'vertical-new', slug: 'clinic' });
    tx.organization.update.mockResolvedValue({
      id: 'org-1',
      slug: 'riyadh-clinic',
      nameAr: cmd.nameAr,
      nameEn: cmd.nameEn,
      verticalId: 'vertical-new',
      trialEndsAt: cmd.trialEndsAt,
      status: 'ACTIVE',
    });
  });

  it('cannot update a missing organization', async () => {
    tx.organization.findUnique.mockResolvedValue(null);

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.organization.update).not.toHaveBeenCalled();
  });

  it('updates nameAr, nameEn, trialEndsAt, and verticalId', async () => {
    await handler.execute(cmd);

    expect(tx.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: expect.objectContaining({
        nameAr: cmd.nameAr,
        nameEn: cmd.nameEn,
        trialEndsAt: cmd.trialEndsAt,
        vertical: { connect: { id: 'vertical-new' } },
      }),
      select: expect.any(Object),
    });
  });

  it('writes audit metadata with previous and next values', async () => {
    await handler.execute(cmd);

    expect(tx.superAdminActionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actionType: 'TENANT_UPDATE',
        organizationId: 'org-1',
        reason: null,
        metadata: expect.objectContaining({
          previous: current,
          next: expect.objectContaining({
            nameAr: cmd.nameAr,
            nameEn: cmd.nameEn,
            verticalId: 'vertical-new',
          }),
        }),
      }),
    });
  });
});
