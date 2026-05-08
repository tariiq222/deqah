import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';

export interface AssignRoleCommand {
  userId: string;
  customRoleId: string;
}

@Injectable()
export class AssignRoleHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async execute(cmd: AssignRoleCommand): Promise<void> {
    const orgId = this.tenant.requireOrganizationIdOrDefault();
    const membership = await this.prisma.membership.findFirst({
      where: { userId: cmd.userId, organizationId: orgId, isActive: true },
      select: { id: true },
    });
    if (!membership) throw new NotFoundException(`User ${cmd.userId} not found`);

    const role = await this.prisma.customRole.findFirst({
      where: { id: cmd.customRoleId },
      select: { id: true },
    });
    if (!role) throw new NotFoundException(`Role ${cmd.customRoleId} not found`);

    const { count } = await this.prisma.user.updateMany({
      where: { id: cmd.userId },
      data: { customRoleId: cmd.customRoleId },
    });
    if (count === 0) throw new NotFoundException(`User ${cmd.userId} not found`);
  }
}
