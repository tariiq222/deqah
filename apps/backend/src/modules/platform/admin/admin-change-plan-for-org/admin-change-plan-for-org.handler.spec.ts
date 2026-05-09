import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SuperAdminActionType } from '@prisma/client';
import { AdminChangePlanForOrgHandler } from './admin-change-plan-for-org.handler';
import { PrismaService } from '../../../../infrastructure/database';

describe('AdminChangePlanForOrgHandler', () => {
  let handler: AdminChangePlanForOrgHandler;
  let subFindUnique: jest.Mock;
  let subUpdate: jest.Mock;
  let planFindUnique: jest.Mock;
  let logCreate: jest.Mock;

  beforeEach(async () => {
    subFindUnique = jest.fn();
    subUpdate = jest.fn();
    planFindUnique = jest.fn();
    logCreate = jest.fn();
    const tx = {
      subscription: { findUnique: subFindUnique, update: subUpdate },
      plan: { findUnique: planFindUnique },
      superAdminActionLog: { create: logCreate },
    };
    const prismaMock = {
      $allTenants: {
        $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      },
    } as unknown as PrismaService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminChangePlanForOrgHandler,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    handler = moduleRef.get(AdminChangePlanForOrgHandler);
  });

  const cmd = {
    organizationId: 'o1',
    newPlanId: 'p-pro',
    superAdminUserId: 'sa1',
    ipAddress: '1.2.3.4',
    userAgent: 'jest',
  };

  it('updates plan + writes audit in same tx', async () => {
    subFindUnique.mockResolvedValue({ id: 'sub1', planId: 'p-basic', organizationId: 'o1' });
    planFindUnique
      .mockResolvedValueOnce({ id: 'p-pro', slug: 'PRO', isActive: true }) // new plan
      .mockResolvedValueOnce({ slug: 'BASIC' }); // previous plan lookup
    subUpdate.mockResolvedValue({});
    logCreate.mockResolvedValue({});

    await handler.execute(cmd);

    expect(subUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sub1' }, data: { planId: 'p-pro' } }),
    );
    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actionType: SuperAdminActionType.BILLING_CHANGE_PLAN,
          organizationId: 'o1',
          reason: null,
          metadata: expect.objectContaining({
            previousPlanId: 'p-basic',
            previousPlanSlug: 'BASIC',
            newPlanId: 'p-pro',
            newPlanSlug: 'PRO',
          }),
        }),
      }),
    );
  });

  it('throws when subscription missing', async () => {
    subFindUnique.mockResolvedValue(null);

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(NotFoundException);
    expect(subUpdate).not.toHaveBeenCalled();
  });

  it('throws when targeting same plan (no-op)', async () => {
    subFindUnique.mockResolvedValue({ id: 'sub1', planId: 'p-pro', organizationId: 'o1' });

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(BadRequestException);
    expect(subUpdate).not.toHaveBeenCalled();
  });

  it('throws when new plan not found', async () => {
    subFindUnique.mockResolvedValue({ id: 'sub1', planId: 'p-basic', organizationId: 'o1' });
    planFindUnique.mockResolvedValueOnce(null);

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws when new plan is inactive', async () => {
    subFindUnique.mockResolvedValue({ id: 'sub1', planId: 'p-basic', organizationId: 'o1' });
    planFindUnique.mockResolvedValueOnce({ id: 'p-pro', slug: 'PRO', isActive: false });

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(BadRequestException);
    expect(subUpdate).not.toHaveBeenCalled();
  });
});
