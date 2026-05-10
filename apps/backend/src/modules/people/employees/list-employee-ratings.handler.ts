import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, RlsTransactionService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { toListResponse } from '../../../common/dto';

export interface ListEmployeeRatingsQuery {
  employeeId: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class ListEmployeeRatingsHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(query: ListEmployeeRatingsQuery) {
    const organizationId = this.tenant.requireOrganizationId();
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const employee = await this.prisma.employee.findFirst({
      where: { id: query.employeeId, organizationId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const where = { employeeId: query.employeeId, organizationId };
    const [items, total] = await this.rlsTx.withTransaction((tx) =>
      Promise.all([
        tx.rating.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
        tx.rating.count({ where }),
      ]),
    );

    return toListResponse(items, total, page, limit);
  }
}
