import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SuperAdminActionType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database';
import { RedisService } from '../../../../infrastructure/cache';
import { PlatformMailerService } from '../../../../infrastructure/mail';

export interface SuspendOrganizationCommand {
  organizationId: string;
  superAdminUserId: string;
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class SuspendOrganizationHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mailer: PlatformMailerService,
  ) {}

  async execute(cmd: SuspendOrganizationCommand) {
    // $allTenants.$transaction: super-admin action — operates across tenants intentionally.
    // Suspends a foreign tenant's Organization row, revokes all active refresh tokens and
    // impersonation sessions for that org; the acting super-admin's own tenant is uninvolved.
    await this.prisma.$allTenants.$transaction(async (tx) => {
      const org = await tx.organization.findUnique({
        where: { id: cmd.organizationId },
        select: { id: true, suspendedAt: true },
      });
      if (!org) throw new NotFoundException('organization_not_found');
      if (org.suspendedAt) throw new ConflictException('organization_already_suspended');

      const now = new Date();
      await tx.organization.update({
        where: { id: cmd.organizationId },
        data: {
          suspendedAt: now,
          suspendedReason: null,
          status: 'SUSPENDED',
        },
      });

      const refreshTokens = await tx.refreshToken.updateMany({
        where: { organizationId: cmd.organizationId, revokedAt: null },
        data: { revokedAt: now },
      });
      const impersonationSessions = await tx.impersonationSession.updateMany({
        where: { organizationId: cmd.organizationId, endedAt: null },
        data: { endedAt: now, endedReason: 'organization_suspended' },
      });

      await tx.superAdminActionLog.create({
        data: {
          superAdminUserId: cmd.superAdminUserId,
          actionType: SuperAdminActionType.SUSPEND_ORG,
          organizationId: cmd.organizationId,
          reason: null,
          metadata: {
            refreshTokensRevoked: refreshTokens.count,
            impersonationSessionsEnded: impersonationSessions.count,
          } satisfies Prisma.InputJsonValue,
          ipAddress: cmd.ipAddress,
          userAgent: cmd.userAgent,
        },
      });
    });

    // Invalidate JwtGuard's suspension cache so the 30s staleness window
    // closes immediately for already-issued JWTs bound to this org.
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
        status: 'SUSPENDED',
      });
    }
  }
}
