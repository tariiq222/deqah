import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database';

export interface ListVerticalsAdminQuery {
  page?: number;
  perPage?: number;
}

@Injectable()
export class ListVerticalsAdminHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListVerticalsAdminQuery = {}) {
    const page = Math.max(1, query.page ?? 1);
    const perPage = Math.min(100, Math.max(1, query.perPage ?? 20));
    const skip = (page - 1) * perPage;

    const [items, total] = await Promise.all([
      this.prisma.$allTenants.vertical.findMany({
        skip,
        take: perPage,
        orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }],
      }),
      this.prisma.$allTenants.vertical.count(),
    ]);

    return {
      items,
      meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) || 1 },
    };
  }
}
