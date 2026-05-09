import { Test } from '@nestjs/testing';
import { SubscriptionStatus } from '@prisma/client';
import { GetBillingMetricsHandler } from './get-billing-metrics.handler';
import { PrismaService } from '../../../../infrastructure/database';

describe('GetBillingMetricsHandler', () => {
  let handler: GetBillingMetricsHandler;
  let findMany: jest.Mock;
  let groupBy: jest.Mock;
  let count: jest.Mock;
  let aggregate: jest.Mock;

  beforeEach(async () => {
    findMany = jest.fn();
    groupBy = jest.fn();
    count = jest.fn();
    aggregate = jest.fn();
    const prismaMock = {
      $allTenants: {
        subscription: { findMany, groupBy, count },
        subscriptionInvoice: { aggregate },
      },
    } as unknown as PrismaService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        GetBillingMetricsHandler,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    handler = moduleRef.get(GetBillingMetricsHandler);
  });

  it('computes MRR + ARR + realized MRR + per-plan breakdown', async () => {
    findMany.mockResolvedValueOnce([
      { planId: 'p1', plan: { slug: 'BASIC', priceMonthly: '349.00' } },
      { planId: 'p1', plan: { slug: 'BASIC', priceMonthly: '349.00' } },
      { planId: 'p2', plan: { slug: 'PRO', priceMonthly: '799.00' } },
    ]);
    findMany.mockResolvedValueOnce([]);
    findMany.mockResolvedValueOnce([]);
    groupBy.mockResolvedValue([
      { status: SubscriptionStatus.ACTIVE, _count: { _all: 3 } },
    ]);
    count.mockResolvedValue(0);
    aggregate.mockResolvedValue({ _sum: { amount: { toString: () => '1200.00' } } });

    const result = await handler.execute();

    expect(result.mrr).toBe('1497.00');
    expect(result.realizedMrr).toBe('1200.00');
    expect(result.arr).toBe('17964.00');
    expect(result.currency).toBe('SAR');
    expect(result.counts.ACTIVE).toBe(3);
    expect(result.counts.CANCELED).toBe(0);
    expect(result.byPlan).toHaveLength(2);
    expect(result.byPlan.find((p) => p.planSlug === 'BASIC')?.activeCount).toBe(2);
    expect(result.byPlan.find((p) => p.planSlug === 'BASIC')?.mrr).toBe('698.00');
  });

  it('returns 0s when no subscriptions exist', async () => {
    findMany.mockResolvedValue([]);
    groupBy.mockResolvedValue([]);
    count.mockResolvedValue(0);
    aggregate.mockResolvedValue({ _sum: { amount: null } });

    const result = await handler.execute();

    expect(result.mrr).toBe('0.00');
    expect(result.realizedMrr).toBe('0.00');
    expect(result.arr).toBe('0.00');
    expect(result.counts.ACTIVE).toBe(0);
    expect(result.byPlan).toEqual([]);
    expect(result.churn30d).toBe(0);
    expect(result.atRiskMrr).toBe('0.00');
    expect(result.scheduledDowngrades).toBe(0);
  });

  it('counts churn = canceled subs in last 30 days', async () => {
    findMany.mockResolvedValue([]);
    groupBy.mockResolvedValue([]);
    count.mockResolvedValue(7);
    aggregate.mockResolvedValue({ _sum: { amount: null } });

    const result = await handler.execute();

    expect(result.churn30d).toBe(7);
    expect(count).toHaveBeenCalledWith({
      where: {
        status: SubscriptionStatus.CANCELED,
        canceledAt: { gte: expect.any(Date) },
      },
    });
  });

  it('computes at-risk MRR from suspended subscriptions', async () => {
    findMany.mockResolvedValueOnce([]);
    findMany.mockResolvedValueOnce([
      { planId: 'p1', plan: { priceMonthly: '349.00' } },
      { planId: 'p2', plan: { priceMonthly: '799.00' } },
    ]);
    findMany.mockResolvedValueOnce([]);
    groupBy.mockResolvedValue([
      { status: SubscriptionStatus.SUSPENDED, _count: { _all: 2 } },
    ]);
    count.mockResolvedValue(0);
    aggregate.mockResolvedValue({ _sum: { amount: null } });

    const result = await handler.execute();

    expect(result.atRiskMrr).toBe('1148.00');
    expect(result.counts.SUSPENDED).toBe(2);
  });

  it('counts scheduled downgrades (lower-priced target)', async () => {
    findMany.mockResolvedValueOnce([]);
    findMany.mockResolvedValueOnce([]);
    findMany.mockResolvedValueOnce([
      { planId: 'p2', scheduledPlanId: 'p1', plan: { priceMonthly: '799.00' }, scheduledPlan: { priceMonthly: '349.00' } },
      { planId: 'p3', scheduledPlanId: 'p2', plan: { priceMonthly: '999.00' }, scheduledPlan: { priceMonthly: '799.00' } },
      { planId: 'p2', scheduledPlanId: 'p3', plan: { priceMonthly: '799.00' }, scheduledPlan: { priceMonthly: '999.00' } },
    ]);
    groupBy.mockResolvedValue([]);
    count.mockResolvedValue(0);
    aggregate.mockResolvedValue({ _sum: { amount: null } });

    const result = await handler.execute();

    expect(result.scheduledDowngrades).toBe(2);
  });
});
