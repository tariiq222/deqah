import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';

export interface DeleteEmployeeExceptionCommand { employeeId: string; exceptionId: string; }

@Injectable()
export class DeleteEmployeeExceptionHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async execute(cmd: DeleteEmployeeExceptionCommand): Promise<void> {
    const organizationId = this.tenant.requireOrganizationId();
    const record = await this.prisma.employeeAvailabilityException.findFirst({
      where: { id: cmd.exceptionId, employeeId: cmd.employeeId, organizationId },
    });
    if (!record) throw new NotFoundException('Exception not found');
    await this.prisma.employeeAvailabilityException.delete({ where: { id: cmd.exceptionId } });
  }
}
