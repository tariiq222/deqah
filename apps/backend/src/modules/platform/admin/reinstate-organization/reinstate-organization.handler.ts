import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrganizationStatus, SuperAdminActionType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database';
import { RedisService } from '../../../../infrastructure/cache';
import { PlatformMailerService } from '../../../../infrastructure/mail';

export interface ReinstateOrganizationCommand {
  organizationId: string;
  superAdminUserId: string;
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class ReinstateOrganizationHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mailer: PlatformMailerService,
  ) {}

  async execute(cmd: ReinstateOrganizationCommand) {
    // $allTenants.$transaction: super-admin action — operates across tenants intentionally.
    // Reinstates a suspended foreign Organization row; clears suspendedAt/suspendedReason
    // on a tenant the super-admin does not belong to.
    await this.prisma.$allTenants.$transaction(async (tx) => {
      const org = await tx.organization.findUnique({
        where: { id: cmd.organizationId },
        select: { id: true, status: true, suspendedAt: true },
      });
      if (!org) throw new NotFoundException('organization_not_found');
      if (org.status === OrganizationStatus.ARCHIVED) {
        throw new ConflictException('organization_archived');
      }
      if (!org.suspendedAt) throw new ConflictException('organization_not_suspended');

      await tx.organization.update({
        where: { id: cmd.organizationId },
        data: {
          suspendedAt: null,
          suspendedReason: null,
          status: 'ACTIVE',
        },
      });

      await tx.superAdminActionLog.create({
        data: {
          superAdminUserId: cmd.superAdminUserId,
          actionType: SuperAdminActionType.REINSTATE_ORG,
          organizationId: cmd.organizationId,
          reason: null,
          metadata: {},
          ipAddress: cmd.ipAddress,
          userAgent: cmd.userAgent,
        },
      });
    });

    await this.redis.getClient().del(`org-suspension:${cmd.organizationId}`);

    const owner = await this.prisma.$allTenants.membership.findFirst({
      where: { organizationId: cmd.organizationId, role: 'OWNER', isActive: true },
      select: {
        displayName: true,
        user: { select: { email: true, name: true } },
        organization: { select: { nameAr: true } },
      },
    });
    if (owner?.user) {
      await this.mailer.sendAccountStatusChanged(owner.user.email, {
        ownerName: owner.displayName ?? owner.user.name ?? '',
        orgName: owner.organization.nameAr,
        status: 'REINSTATED',
      });
    }
  }
}
