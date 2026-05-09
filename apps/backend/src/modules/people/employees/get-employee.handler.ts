import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { mapEmployeeRow } from './employee-row.mapper';

export interface GetEmployeeQuery {
  employeeId: string;
}

@Injectable()
export class GetEmployeeHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async execute(query: GetEmployeeQuery) {
    const organizationId = this.tenant.requireOrganizationId();
    const [employee, ratingAgg, bookingCount] = await Promise.all([
      this.prisma.employee.findFirst({
        where: { id: query.employeeId, organizationId },
        include: {
          branches: true,
          services: true,
          availability: { where: { isActive: true }, orderBy: { dayOfWeek: 'asc' } },
          exceptions: { orderBy: { startDate: 'asc' } },
        },
      }),
      this.prisma.rating.aggregate({
        where: { employeeId: query.employeeId },
        _avg: { score: true },
        _count: { _all: true },
      }),
      this.prisma.booking.count({ where: { employeeId: query.employeeId, organizationId } }),
    ]);

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return {
      ...mapEmployeeRow(
        employee,
        { avg: ratingAgg._avg.score, count: ratingAgg._count._all },
        bookingCount,
      ),
      exceptions: employee.exceptions,
    };
  }
}
