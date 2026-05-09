import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { CreatePlanHandler } from './create-plan.handler';
import { PrismaService } from '../../../../infrastructure/database';
import { DEFAULT_PLAN_LIMITS } from '../../billing/plan-limits.zod';
import { LaunchFlags } from '../../billing/feature-flags/launch-flags';
import { CreatePlanVersionHandler } from '../../billing/plan-versions/create-plan-version.handler';

describe('CreatePlanHandler', () => {
  let handler: CreatePlanHandler;
  let planFindUnique: jest.Mock;
  let planCreate: jest.Mock;
  let logCreate: jest.Mock;

  beforeEach(async () => {
    planFindUnique = jest.fn();
    planCreate = jest.fn();
    logCreate = jest.fn();

    const tx = {
      plan: { findUnique: planFindUnique, create: planCreate },
      superAdminActionLog: { create: logCreate },
    };
    const prismaMock = {
      $allTenants: {
        $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      },
    } as unknown as PrismaService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        CreatePlanHandler,
        { provide: PrismaService, useValue: prismaMock },
        { provide: LaunchFlags, useValue: { planVersioningEnabled: false } },
        { provide: CreatePlanVersionHandler, useValue: { execute: jest.fn().mockResolvedValue({}) } },
      ],
    }).compile();

    handler = moduleRef.get(CreatePlanHandler);
  });

  const baseCmd = {
    superAdminUserId: 'sa1',
    ipAddress: '1.2.3.4',
    userAgent: 'jest',
    data: {
      slug: 'BASIC' as const,
      nameAr: 'أساسي',
      nameEn: 'Basic',
      priceMonthly: 99,
      priceAnnual: 990,
      limits: DEFAULT_PLAN_LIMITS,
    },
  };

  it('creates a plan and writes audit log', async () => {
    planFindUnique.mockResolvedValue(null);
    planCreate.mockResolvedValue({ id: 'p1', slug: 'BASIC' });

    const result = await handler.execute(baseCmd);

    expect(result.id).toBe('p1');
    expect(planCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: 'BASIC', nameEn: 'Basic', currency: 'SAR' }),
      }),
    );
    expect(logCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actionType: 'PLAN_CREATE',
        metadata: { planId: 'p1', slug: 'BASIC' },
      }),
    });
  });

  it('throws ConflictException when slug already exists', async () => {
    planFindUnique.mockResolvedValue({ id: 'existing', slug: 'BASIC' });

    await expect(handler.execute(baseCmd)).rejects.toBeInstanceOf(ConflictException);
    expect(planCreate).not.toHaveBeenCalled();
  });
});
