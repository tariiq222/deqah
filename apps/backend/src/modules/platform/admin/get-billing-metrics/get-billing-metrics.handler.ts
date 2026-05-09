import { Injectable } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database';

export interface BillingMetrics {
  mrr: string;
  realizedMrr: string;
  arr: string;
  currency: string;
  counts: Record<SubscriptionStatus, number>;
  churn30d: number;
  atRiskMrr: string;
  scheduledDowngrades: number;
  byPlan: Array<{ planId: string; planSlug: string; activeCount: number; mrr: string }>;
}

@Injectable()
export class GetBillingMetricsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(): Promise<BillingMetrics> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      subs,
      suspendedSubs,
      scheduledDowngradeSubs,
      canceledIn30d,
      paidInvoicesAggregate,
      counts,
    ] = await Promise.all([
      this.prisma.$allTenants.subscription.findMany({
        where: { status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] } },
        select: {
          planId: true,
          plan: { select: { slug: true, priceMonthly: true } },
        },
      }),
      this.prisma.$allTenants.subscription.findMany({
        where: { status: SubscriptionStatus.SUSPENDED },
        select: { planId: true, plan: { select: { priceMonthly: true } } },
      }),
      this.prisma.$allTenants.subscription.findMany({
        where: {
          status: { in: [SubscriptionStatus.ACTIVE] },
          scheduledPlanId: { not: null },
          scheduledPlanChangeAt: { lte: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000) },
        },
        select: {
          planId: true,
          scheduledPlanId: true,
          plan: { select: { priceMonthly: true } },
          scheduledPlan: { select: { priceMonthly: true } },
        },
      }),
      this.prisma.$allTenants.subscription.count({
        where: { status: SubscriptionStatus.CANCELED, canceledAt: { gte: thirtyDaysAgo } },
      }),
      this.prisma.$allTenants.subscriptionInvoice.aggregate({
        where: {
          status: 'PAID',
          paidAt: { gte: startOfMonth },
        },
        _sum: { amount: true },
      }),
      this.prisma.$allTenants.subscription.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

    let mrr = new Prisma.Decimal(0);
    let atRiskMrr = new Prisma.Decimal(0);
    const planAgg = new Map<
      string,
      { planSlug: string; activeCount: number; mrr: Prisma.Decimal }
    >();

    for (const s of subs) {
      const price = new Prisma.Decimal(s.plan.priceMonthly);
      mrr = mrr.add(price);
      const existing = planAgg.get(s.planId);
      if (existing) {
        existing.activeCount += 1;
        existing.mrr = existing.mrr.add(price);
      } else {
        planAgg.set(s.planId, { planSlug: s.plan.slug, activeCount: 1, mrr: price });
      }
    }

    for (const s of suspendedSubs) {
      atRiskMrr = atRiskMrr.add(new Prisma.Decimal(s.plan.priceMonthly));
    }

    const scheduledDowngrades = scheduledDowngradeSubs.filter((s) => {
      if (!s.scheduledPlan) return false;
      const currentPrice = Number(s.plan.priceMonthly);
      const scheduledPrice = Number(s.scheduledPlan.priceMonthly);
      return scheduledPrice < currentPrice;
    }).length;

    const realizedMrr = new Prisma.Decimal(
      paidInvoicesAggregate._sum.amount?.toString() ?? '0',
    );

    const countsByStatus = Object.fromEntries(
      Object.values(SubscriptionStatus).map((s) => [s, 0]),
    ) as Record<SubscriptionStatus, number>;
    for (const row of counts) countsByStatus[row.status] = row._count._all;

    return {
      mrr: mrr.toFixed(2),
      realizedMrr: realizedMrr.toFixed(2),
      arr: mrr.mul(12).toFixed(2),
      currency: 'SAR',
      counts: countsByStatus,
      churn30d: canceledIn30d,
      atRiskMrr: atRiskMrr.toFixed(2),
      scheduledDowngrades,
      byPlan: Array.from(planAgg.entries()).map(([planId, v]) => ({
        planId,
        planSlug: v.planSlug,
        activeCount: v.activeCount,
        mrr: v.mrr.toFixed(2),
      })),
    };
  }
}
