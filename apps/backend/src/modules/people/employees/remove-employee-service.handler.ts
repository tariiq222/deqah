import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';

export interface RemoveEmployeeServiceCommand { employeeId: string; serviceId: string; }

@Injectable()
export class RemoveEmployeeServiceHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async execute(cmd: RemoveEmployeeServiceCommand): Promise<void> {
    const organizationId = this.tenant.requireOrganizationId();
    const record = await this.prisma.employeeService.findUnique({
      where: {
        employeeId_serviceId: { employeeId: cmd.employeeId, serviceId: cmd.serviceId },
        organizationId,
      },
    });
    if (!record) {
      throw new NotFoundException('Service assignment not found');
    }
    await this.prisma.employeeService.delete({
      where: { employeeId_serviceId: { employeeId: cmd.employeeId, serviceId: cmd.serviceId } },
    });
  }
}
