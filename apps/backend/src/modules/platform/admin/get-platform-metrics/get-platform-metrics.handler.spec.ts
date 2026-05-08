import { Test } from '@nestjs/testing';
import { GetPlatformMetricsHandler } from './get-platform-metrics.handler';
import { PrismaService } from '../../../../infrastructure/database';

describe('GetPlatformMetricsHandler', () => {
  it('aggregates platform-wide metrics from $allTenants', async () => {
    const orgCount = jest.fn();
    orgCount
      .mockResolvedValueOnce(95) // totalOrgs (excluding ARCHIVED)
      .mockResolvedValueOnce(90) // activeOrgs (ACTIVE + suspendedAt=null)
      .mockResolvedValueOnce(5)  // suspendedOrgs
      .mockResolvedValueOnce(7); // newOrgs (excluding ARCHIVED)
    const userCount = jest.fn().mockResolvedValue(800);
    const bookingCount = jest.fn().mockResolvedValue(2400);
    const invoiceAggregate = jest.fn().mockResolvedValue({ _sum: { amount: 125000 } });
    const subGroupByPlan = jest.fn().mockResolvedValue([
      { planId: 'p1', _count: 60 },
      { planId: 'p2', _count: 35 },
    ]);
    const subGroupByStatus = jest.fn().mockResolvedValue([
      { status: 'ACTIVE', _count: 80 },
      { status: 'PAST_DUE', _count: 5 },
    ]);

    const prismaMock = {
      $allTenants: {
        organization: { count: orgCount },
        user: { count: userCount },
        booking: { count: bookingCount },
        subscriptionInvoice: { aggregate: invoiceAggregate },
        subscription: {
          groupBy: jest
            .fn()
            .mockImplementationOnce(subGroupByPlan)
            .mockImplementationOnce(subGroupByStatus),
        },
      },
    } as unknown as PrismaService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        GetPlatformMetricsHandler,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    const handler = moduleRef.get(GetPlatformMetricsHandler);

    const result = await handler.execute();

    expect(result.organizations).toEqual({
      total: 95,
      active: 90,
      suspended: 5,
      newThisMonth: 7,
    });
    expect(result.users.total).toBe(800);
    expect(result.bookings.totalLast30Days).toBe(2400);
    expect(result.revenue.lifetimePaidSar).toBe(125000);
    expect(result.subscriptions.byPlan).toEqual({ p1: 60, p2: 35 });
    expect(result.subscriptions.byStatus).toEqual({ ACTIVE: 80, PAST_DUE: 5 });
  });

  it('returns 0 revenue when no PAID invoices', async () => {
    const orgCount = jest.fn().mockResolvedValue(0);
    const prismaMock = {
      $allTenants: {
        organization: { count: orgCount },
        user: { count: jest.fn().mockResolvedValue(0) },
        booking: { count: jest.fn().mockResolvedValue(0) },
        subscriptionInvoice: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }) },
        subscription: { groupBy: jest.fn().mockResolvedValue([]) },
      },
    } as unknown as PrismaService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        GetPlatformMetricsHandler,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    const handler = moduleRef.get(GetPlatformMetricsHandler);

    const result = await handler.execute();

    expect(result.revenue.lifetimePaidSar).toBe(0);
    expect(result.subscriptions.byPlan).toEqual({});
  });

  describe('soft-delete + status filtering', () => {
    let handler: GetPlatformMetricsHandler;
    let prisma: { $allTenants: { organization: { count: jest.Mock }; user: { count: jest.Mock }; booking: { count: jest.Mock }; subscriptionInvoice: { aggregate: jest.Mock }; subscription: { groupBy: jest.Mock } } };

    beforeEach(async () => {
      const orgCount = jest.fn().mockResolvedValue(0);
      const prismaMock = {
        $allTenants: {
          organization: { count: orgCount },
          user: { count: jest.fn().mockResolvedValue(0) },
          booking: { count: jest.fn().mockResolvedValue(0) },
          subscriptionInvoice: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }) },
          subscription: { groupBy: jest.fn().mockResolvedValue([]) },
        },
      } as unknown as PrismaService;

      prisma = prismaMock as unknown as typeof prisma;

      const moduleRef = await Test.createTestingModule({
        providers: [
          GetPlatformMetricsHandler,
          { provide: PrismaService, useValue: prismaMock },
        ],
      }).compile();
      handler = moduleRef.get(GetPlatformMetricsHandler);
    });

    it('excludes ARCHIVED orgs from total count', async () => {
      await handler.execute();
      expect(prisma.$allTenants.organization.count).toHaveBeenCalledWith({
        where: { status: { not: 'ARCHIVED' } },
      });
    });

    it('counts only ACTIVE non-suspended orgs as active', async () => {
      await handler.execute();
      expect(prisma.$allTenants.organization.count).toHaveBeenCalledWith({
        where: { status: 'ACTIVE', suspendedAt: null },
      });
    });

    it('excludes ARCHIVED orgs from "newThisMonth" count', async () => {
      await handler.execute();
      expect(prisma.$allTenants.organization.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: { not: 'ARCHIVED' } }),
        }),
      );
    });

    it('counts only isActive=true users', async () => {
      await handler.execute();
      expect(prisma.$allTenants.user.count).toHaveBeenCalledWith({ where: { isActive: true } });
    });
  });
});
