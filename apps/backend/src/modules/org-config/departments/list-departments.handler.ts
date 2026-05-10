import { Injectable } from '@nestjs/common';
import { PrismaService, RlsTransactionService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { toListResponse } from '../../../common/dto';
import { ListDepartmentsDto } from './list-departments.dto';

export type ListDepartmentsQuery = ListDepartmentsDto;

@Injectable()
export class ListDepartmentsHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(dto: ListDepartmentsQuery) {
    const organizationId = this.tenant.requireOrganizationId();
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      organizationId,
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.search && {
        OR: [
          { nameAr: { contains: dto.search, mode: 'insensitive' as const } },
          { nameEn: { contains: dto.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [items, total] = await this.rlsTx.withTransaction((tx) =>
      Promise.all([
        tx.department.findMany({
          where,
          skip,
          take: limit,
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
          include: { categories: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
        }),
        tx.department.count({ where }),
      ]),
    );

    return toListResponse(items, total, page, limit);
  }
}
