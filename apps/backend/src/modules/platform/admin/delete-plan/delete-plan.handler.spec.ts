import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DeletePlanHandler } from './delete-plan.handler';
import { PrismaService } from '../../../../infrastructure/database';

describe('DeletePlanHandler', () => {
  let handler: DeletePlanHandler;
  let planFindUnique: jest.Mock;
  let planUpdate: jest.Mock;
  let subCount: jest.Mock;
  let logCreate: jest.Mock;

  beforeEach(async () => {
    planFindUnique = jest.fn();
    planUpdate = jest.fn();
    subCount = jest.fn();
    logCreate = jest.fn();

    const tx = {
      plan: { findUnique: planFindUnique, update: planUpdate },
      subscription: { count: subCount },
      superAdminActionLog: { create: logCreate },
    };
    const prismaMock = {
      $allTenants: {
        $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      },
    } as unknown as PrismaService;

    const moduleRef = await Test.createTestingModule({
      providers: [DeletePlanHandler, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    handler = moduleRef.get(DeletePlanHandler);
  });

  const cmd = {
    planId: 'p1',
    superAdminUserId: 'sa1',
    ipAddress: '1.2.3.4',
    userAgent: 'jest',
  };

  it('soft-deletes a plan with no active subs and writes audit log', async () => {
    planFindUnique.mockResolvedValue({ id: 'p1', isActive: true, _count: { subscriptions: 0 } });

    await handler.execute(cmd);

    expect(planUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { isActive: false },
    });
    expect(logCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actionType: 'PLAN_DELETE',
        metadata: { planId: 'p1', softDelete: true },
      }),
    });
  });

  it('throws NotFoundException when plan missing', async () => {
    planFindUnique.mockResolvedValue(null);

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws ConflictException when plan already inactive', async () => {
    planFindUnique.mockResolvedValue({ id: 'p1', isActive: false, _count: { subscriptions: 0 } });

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws ConflictException when plan has active subscriptions', async () => {
    planFindUnique.mockResolvedValue({ id: 'p1', isActive: true, _count: { subscriptions: 5 } });
    subCount.mockResolvedValue(3);

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(ConflictException);
    expect(planUpdate).not.toHaveBeenCalled();
  });

  it('allows soft-delete when only canceled subs exist', async () => {
    planFindUnique.mockResolvedValue({ id: 'p1', isActive: true, _count: { subscriptions: 2 } });
    subCount.mockResolvedValue(0);

    await handler.execute(cmd);

    expect(planUpdate).toHaveBeenCalled();
  });
});
