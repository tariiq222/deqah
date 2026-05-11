import { Injectable } from '@nestjs/common';
import { Prisma, SuperAdminActionType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database';

export interface ListAuditLogQuery {
  page: number;
  perPage: number;
  actionType?: SuperAdminActionType;
  superAdminUserId?: string;
  organizationId?: string;
  from?: Date;
  to?: Date;
}

@Injectable()
export class ListAuditLogHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(q: ListAuditLogQuery) {
    const where: Prisma.SuperAdminActionLogWhereInput = {};
    if (q.actionType) where.actionType = q.actionType;
    if (q.superAdminUserId) where.superAdminUserId = q.superAdminUserId;
    if (q.organizationId) where.organizationId = q.organizationId;
    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt.gte = q.from;
      if (q.to) where.createdAt.lte = q.to;
    }

    const [items, total] = await Promise.all([
      // SAFE: super-admin handler; reads platform audit log across all tenants
      this.prisma.$allTenants.superAdminActionLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.perPage,
        take: q.perPage,
      }),
      this.prisma.$allTenants.superAdminActionLog.count({ where }),
    ]);

    return {
      items,
      meta: {
        page: q.page,
        perPage: q.perPage,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / q.perPage),
      },
    };
  }
}
