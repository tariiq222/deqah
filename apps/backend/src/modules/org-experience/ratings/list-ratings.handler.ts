import { Injectable } from '@nestjs/common';
import { PrismaService, RlsTransactionService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { toListResponse } from '../../../common/dto';
import { ListRatingsDto } from './list-ratings.dto';

export type ListRatingsCommand = ListRatingsDto;

@Injectable()
export class ListRatingsHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(dto: ListRatingsCommand) {
    const organizationId = this.tenant.requireOrganizationId();
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      organizationId,
      ...(dto.employeeId && { employeeId: dto.employeeId }),
      ...(dto.clientId && { clientId: dto.clientId }),
    };

    const [items, total] = await this.rlsTx.withTransaction((tx) =>
      Promise.all([
        tx.rating.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
        tx.rating.count({ where }),
      ]),
    );

    return toListResponse(items, total, page, limit);
  }
}
