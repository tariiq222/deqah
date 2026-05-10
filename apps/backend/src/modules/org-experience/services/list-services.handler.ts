import { Injectable } from '@nestjs/common';
import { PrismaService, RlsTransactionService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { toListResponse } from '../../../common/dto';
import { ListServicesDto } from './list-services.dto';

export type ListServicesCommand = ListServicesDto;

@Injectable()
export class ListServicesHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(dto: ListServicesCommand) {
    const organizationId = this.tenant.requireOrganizationId();
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      organizationId,
      archivedAt: null,
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      // إخفاء الخدمات المخفية افتراضياً ما لم يُطلب تضمينها صراحةً
      ...(dto.includeHidden !== true && { isHidden: false }),
      ...(dto.categoryId && { categoryId: dto.categoryId }),
      ...(dto.search && {
        OR: [
          { nameAr: { contains: dto.search, mode: 'insensitive' as const } },
          { nameEn: { contains: dto.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [items, total] = await this.rlsTx.withTransaction((tx) =>
      Promise.all([
        tx.service.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            category: true,
            durationOptions: { orderBy: { sortOrder: 'asc' } },
          },
        }),
        tx.service.count({ where }),
      ]),
    );

    return toListResponse(items, total, page, limit);
  }
}
