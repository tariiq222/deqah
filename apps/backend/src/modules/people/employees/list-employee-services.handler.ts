import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';

export interface ListEmployeeServicesQuery { employeeId: string; }

@Injectable()
export class ListEmployeeServicesHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async execute(query: ListEmployeeServicesQuery) {
    const organizationId = this.tenant.requireOrganizationId();
    const employee = await this.prisma.employee.findFirst({
      where: { id: query.employeeId, organizationId },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    const links = await this.prisma.employeeService.findMany({
      where: { employeeId: query.employeeId, organizationId },
    });
    if (links.length === 0) return [];
    const services = await this.prisma.service.findMany({
      where: { id: { in: links.map((l) => l.serviceId) }, organizationId },
    });
    const byId = new Map(services.map((s) => [s.id, s]));
    return links.map((l) => ({ ...l, service: byId.get(l.serviceId) ?? null }));
  }
}
