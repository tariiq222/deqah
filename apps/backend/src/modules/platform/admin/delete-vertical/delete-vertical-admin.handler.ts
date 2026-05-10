import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SuperAdminActionType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database';

export interface DeleteVerticalAdminCommand {
  verticalId: string;
  superAdminUserId: string;
  ipAddress: string;
  userAgent: string;
}

// Soft-delete: flip isActive to false. We never hard-delete because
// Organizations reference verticalId for terminology + identity.
@Injectable()
export class DeleteVerticalAdminHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(cmd: DeleteVerticalAdminCommand) {
    // $allTenants.$transaction: super-admin action — operates across tenants intentionally.
    // Soft-deletes a platform-wide Vertical row (isActive=false); Vertical is global and
    // unreachable under RLS — bypass is required even for the safety check on active orgs.
    return this.prisma.$allTenants.$transaction(async (tx) => {
      const vertical = await tx.vertical.findUnique({
        where: { id: cmd.verticalId },
        select: { id: true, isActive: true, _count: { select: { organizations: true } } },
      });
      if (!vertical) throw new NotFoundException('vertical_not_found');
      if (!vertical.isActive) throw new ConflictException('vertical_already_inactive');
      if (vertical._count.organizations > 0) {
        throw new ConflictException('vertical_in_use_by_organizations');
      }

      await tx.vertical.update({
        where: { id: cmd.verticalId },
        data: { isActive: false },
      });

      await tx.superAdminActionLog.create({
        data: {
          superAdminUserId: cmd.superAdminUserId,
          actionType: SuperAdminActionType.VERTICAL_DELETE,
          organizationId: null,
          reason: null,
          metadata: { verticalId: cmd.verticalId, softDelete: true },
          ipAddress: cmd.ipAddress,
          userAgent: cmd.userAgent,
        },
      });
    });
  }
}
