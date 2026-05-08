import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';

export interface RemoveRoleCommand {
  userId: string;
  customRoleId: string;
}

@Injectable()
export class RemoveRoleHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async execute(cmd: RemoveRoleCommand): Promise<void> {
    const orgId = this.tenant.requireOrganizationIdOrDefault();
    const membership = await this.prisma.membership.findFirst({
      where: { userId: cmd.userId, organizationId: orgId, isActive: true },
      select: { id: true },
    });
    if (!membership) {
      throw new NotFoundException(
        `User ${cmd.userId} does not have role ${cmd.customRoleId} assigned`,
      );
    }

    const { count } = await this.prisma.user.updateMany({
      where: { id: cmd.userId, customRoleId: cmd.customRoleId },
      data: { customRoleId: null },
    });
    if (count === 0) {
      throw new NotFoundException(
        `User ${cmd.userId} does not have role ${cmd.customRoleId} assigned`,
      );
    }
  }
}
