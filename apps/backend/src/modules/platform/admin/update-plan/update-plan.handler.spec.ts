import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UpdatePlanHandler } from './update-plan.handler';
import { PrismaService } from '../../../../infrastructure/database';
import { EventBusService } from '../../../../infrastructure/events';
import { LaunchFlags } from '../../billing/feature-flags/launch-flags';
import { CreatePlanVersionHandler } from '../../billing/plan-versions/create-plan-version.handler';

describe('UpdatePlanHandler', () => {
  let handler: UpdatePlanHandler;
  let planFindUnique: jest.Mock;
  let planUpdate: jest.Mock;
  let logCreate: jest.Mock;

  beforeEach(async () => {
    planFindUnique = jest.fn();
    planUpdate = jest.fn();
    logCreate = jest.fn();

    const tx = {
      plan: { findUnique: planFindUnique, update: planUpdate },
      superAdminActionLog: { create: logCreate },
    };
    const prismaMock = {
      $allTenants: {
        $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
        subscription: { findMany: jest.fn().mockResolvedValue([]) },
      },
    } as unknown as PrismaService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        UpdatePlanHandler,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EventBusService, useValue: { publish: jest.fn().mockResolvedValue(undefined) } },
        { provide: LaunchFlags, useValue: { planVersioningEnabled: false } },
        { provide: CreatePlanVersionHandler, useValue: { execute: jest.fn().mockResolvedValue({}) } },
      ],
    }).compile();
    handler = moduleRef.get(UpdatePlanHandler);
  });

  const cmd = {
    planId: 'p1',
    superAdminUserId: 'sa1',
    ipAddress: '1.2.3.4',
    userAgent: 'jest',
    data: { priceMonthly: 149, isActive: false },
  };

  it('updates a plan and writes audit log with changedFields', async () => {
    planFindUnique.mockResolvedValue({ id: 'p1' });
    planUpdate.mockResolvedValue({ id: 'p1', priceMonthly: 149 });

    await handler.execute(cmd);

    expect(planUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: expect.objectContaining({ isActive: false }),
    });
    expect(logCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actionType: 'PLAN_UPDATE',
        metadata: expect.objectContaining({
          planId: 'p1',
          changedFields: expect.arrayContaining(['priceMonthly', 'isActive']),
        }),
      }),
    });
  });

  it('throws NotFoundException when plan missing', async () => {
    planFindUnique.mockResolvedValue(null);

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(NotFoundException);
    expect(planUpdate).not.toHaveBeenCalled();
  });
});
