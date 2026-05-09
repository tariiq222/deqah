import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';

export interface ListEmployeeExceptionsQuery { employeeId: string; }

@Injectable()
export class ListEmployeeExceptionsHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async execute(query: ListEmployeeExceptionsQuery) {
    const organizationId = this.tenant.requireOrganizationId();
    const employee = await this.prisma.employee.findFirst({
      where: { id: query.employeeId, organizationId },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return this.prisma.employeeAvailabilityException.findMany({
      where: { employeeId: query.employeeId, organizationId },
      orderBy: { startDate: 'asc' },
    });
  }
}
