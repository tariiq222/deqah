import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrganizationStatus, Prisma, SuperAdminActionType } from '@prisma/client';
import { RedisService } from '../../../../infrastructure/cache';
import { PrismaService } from '../../../../infrastructure/database';

export interface ArchiveOrganizationCommand {
  organizationId: string;
  superAdminUserId: string;
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class ArchiveOrganizationHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async execute(cmd: ArchiveOrganizationCommand) {
    const archived = await this.prisma.$allTenants.$transaction(async (tx) => {
      const org = await tx.organization.findUnique({
        where: { id: cmd.organizationId },
        select: { id: true, status: true, suspendedAt: true },
      });
      if (!org) throw new NotFoundException('organization_not_found');
      if (org.status === OrganizationStatus.ARCHIVED) {
        throw new ConflictException('organization_already_archived');
      }

      const now = new Date();
      const updated = await tx.organization.update({
        where: { id: cmd.organizationId },
        data: {
          status: OrganizationStatus.ARCHIVED,
          suspendedAt: org.suspendedAt ?? now,
          suspendedReason: null,
        },
        select: { id: true, status: true, suspendedAt: true, suspendedReason: true },
      });

      const refreshTokens = await tx.refreshToken.updateMany({
        where: { organizationId: cmd.organizationId, revokedAt: null },
        data: { revokedAt: now },
      });
      const impersonationSessions = await tx.impersonationSession.updateMany({
        where: { organizationId: cmd.organizationId, endedAt: null },
        data: { endedAt: now, endedReason: 'organization_archived' },
      });

      await tx.superAdminActionLog.create({
        data: {
          superAdminUserId: cmd.superAdminUserId,
          actionType: SuperAdminActionType.TENANT_ARCHIVE,
          organizationId: cmd.organizationId,
          reason: null,
          metadata: {
            previousStatus: org.status,
            refreshTokensRevoked: refreshTokens.count,
            impersonationSessionsEnded: impersonationSessions.count,
          } satisfies Prisma.InputJsonValue,
          ipAddress: cmd.ipAddress,
          userAgent: cmd.userAgent,
        },
      });

      return updated;
    });

    await this.redis.getClient().del(`org-suspension:${cmd.organizationId}`);
    return archived;
  }
}
