import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';

export interface ListEmployeeServicesQuery { employeeId: string; }

@Injectable()
export class ListEmployeeServicesHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListEmployeeServicesQuery) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: query.employeeId },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    const links = await this.prisma.employeeService.findMany({
      where: { employeeId: query.employeeId },
    });
    if (links.length === 0) return [];
    const services = await this.prisma.service.findMany({
      where: { id: { in: links.map((l) => l.serviceId) } },
    });
    const byId = new Map(services.map((s) => [s.id, s]));
    return links.map((l) => ({ ...l, service: byId.get(l.serviceId) ?? null }));
  }
}
