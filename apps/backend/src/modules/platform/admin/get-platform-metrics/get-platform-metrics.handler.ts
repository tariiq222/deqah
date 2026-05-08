import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database';

export interface PlatformMetrics {
  organizations: {
    total: number;
    active: number;
    suspended: number;
    newThisMonth: number;
  };
  users: { total: number };
  bookings: { totalLast30Days: number };
  revenue: { lifetimePaidSar: number };
  subscriptions: {
    byPlan: Record<string, number>;
    byStatus: Record<string, number>;
  };
}

@Injectable()
export class GetPlatformMetricsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(): Promise<PlatformMetrics> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const all = this.prisma.$allTenants;

    const [
      totalOrgs,
      activeOrgs,
      suspendedOrgs,
      newOrgs,
      totalUsers,
      bookings30d,
      revenueAggregate,
      subscriptionsByPlan,
      subscriptionsByStatus,
    ] = await Promise.all([
      // total = active + suspended only; exclude ARCHIVED
      all.organization.count({ where: { status: { not: 'ARCHIVED' } } }),
      all.organization.count({ where: { status: 'ACTIVE', suspendedAt: null } }),
      all.organization.count({ where: { suspendedAt: { not: null } } }),
      all.organization.count({
        where: { createdAt: { gte: startOfMonth }, status: { not: 'ARCHIVED' } },
      }),
      // users: exclude soft-deleted
      all.user.count({ where: { isActive: true } }),
      all.booking.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      all.subscriptionInvoice.aggregate({
        where: { status: 'PAID' },
        _sum: { amount: true },
      }),
      all.subscription.groupBy({ by: ['planId'], _count: true }),
      all.subscription.groupBy({ by: ['status'], _count: true }),
    ]);

    return {
      organizations: {
        total: totalOrgs,
        active: activeOrgs,
        suspended: suspendedOrgs,
        newThisMonth: newOrgs,
      },
      users: { total: totalUsers },
      bookings: { totalLast30Days: bookings30d },
      revenue: { lifetimePaidSar: Number(revenueAggregate._sum.amount ?? 0) },
      subscriptions: {
        byPlan: Object.fromEntries(
          subscriptionsByPlan.map((row) => [row.planId, Number((row as { _count: number })._count)]),
        ),
        byStatus: Object.fromEntries(
          subscriptionsByStatus.map((row) => [row.status, Number((row as { _count: number })._count)]),
        ),
      },
    };
  }
}
