import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, RlsTransactionService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { toListResponse } from '../../../common/dto';
import { ListCategoriesDto } from './list-categories.dto';

export type ListCategoriesQuery = ListCategoriesDto;

@Injectable()
export class ListCategoriesHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(dto: ListCategoriesQuery) {
    const organizationId = this.tenant.requireOrganizationId();
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ServiceCategoryWhereInput = {
      organizationId,
      ...(dto.departmentId !== undefined && { departmentId: dto.departmentId }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.search && {
        OR: [
          { nameAr: { contains: dto.search, mode: 'insensitive' } },
          { nameEn: { contains: dto.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await this.rlsTx.withTransaction((tx) =>
      Promise.all([
        tx.serviceCategory.findMany({
          where,
          skip,
          take: limit,
          include: { _count: { select: { services: true } } },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        }),
        tx.serviceCategory.count({ where }),
      ]),
    );

    return toListResponse(items, total, page, limit);
  }
}
