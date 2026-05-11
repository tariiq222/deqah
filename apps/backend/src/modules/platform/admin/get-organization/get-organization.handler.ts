import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database';

export interface GetOrganizationQuery {
  id: string;
}

@Injectable()
export class GetOrganizationHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(q: GetOrganizationQuery) {
    const org = await this.prisma.$allTenants.organization.findUnique({
      where: { id: q.id },
      include: {
        vertical: { select: { id: true, nameAr: true, nameEn: true } },
        memberships: {
          where: { role: 'OWNER', isActive: true },
          take: 1,
          select: {
            user: { select: { name: true, email: true, phone: true } },
          },
        },
      },
    });
    if (!org) throw new NotFoundException('organization_not_found');

    const { memberships, vertical, ...orgFields } = org;
    const ownerMembership = memberships[0] as typeof memberships[0] | undefined;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [memberCount, bookingCount30d, revenueAggregate] = await Promise.all([
      this.prisma.$allTenants.membership.count({
        where: { organizationId: q.id, isActive: true },
      }),
      this.prisma.$allTenants.booking.count({
        where: { organizationId: q.id, createdAt: { gte: thirtyDaysAgo } },
      }),
      this.prisma.$allTenants.subscriptionInvoice.aggregate({
        where: { organizationId: q.id, status: 'PAID' },
        _sum: { amount: true },
      }),
    ]);

    return {
      ...orgFields,
      vertical: vertical ?? null,
      owner: ownerMembership?.user ?? null,
      stats: {
        memberCount,
        bookingCount30d,
        totalRevenue: revenueAggregate._sum.amount ?? 0,
      },
    };
  }
}
