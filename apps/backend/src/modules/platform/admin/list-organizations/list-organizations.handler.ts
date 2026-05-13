import { Injectable } from '@nestjs/common';
import { OrganizationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database';

export interface ListOrganizationsQuery {
  page: number;
  perPage: number;
  search?: string;
  suspended?: boolean;
  status?: OrganizationStatus;
  verticalId?: string;
  planId?: string;
}

@Injectable()
export class ListOrganizationsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(q: ListOrganizationsQuery) {
    const where: Prisma.OrganizationWhereInput = {};

    if (q.search) {
      where.OR = [
        { slug: { contains: q.search, mode: 'insensitive' } },
        { nameAr: { contains: q.search, mode: 'insensitive' } },
        { nameEn: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    if (q.suspended === true) where.suspendedAt = { not: null };
    if (q.suspended === false) where.suspendedAt = null;
    if (q.status) where.status = q.status;
    if (q.verticalId) where.verticalId = q.verticalId;
    if (q.planId) where.subscription = { is: { planId: q.planId } };

    const [items, total] = await Promise.all([
      this.prisma.$allTenants.organization.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.perPage,
        take: q.perPage,
        select: {
          id: true,
          slug: true,
          nameAr: true,
          nameEn: true,
          status: true,
          verticalId: true,
          trialEndsAt: true,
          suspendedAt: true,
          suspendedReason: true,
          createdAt: true,
          subscription: {
            select: {
              status: true,
              plan: { select: { slug: true, nameEn: true } },
            },
          },
          memberships: {
            where: { role: 'OWNER', isActive: true },
            take: 1,
            select: {
              user: { select: { name: true, email: true } },
            },
          },
        },
      }),
      this.prisma.$allTenants.organization.count({ where }),
    ]);

    const mappedItems = items.map(({ memberships = [], ...org }) => ({
      ...org,
      owner: memberships[0]?.user
        ? { name: memberships[0].user.name, email: memberships[0].user.email }
        : null,
    }));

    return {
      items: mappedItems,
      meta: {
        page: q.page,
        perPage: q.perPage,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / q.perPage),
      },
    };
  }
}
