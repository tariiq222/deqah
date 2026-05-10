import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SuperAdminActionType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database';

const IMPERSONATION_TTL_MS = 15 * 60 * 1000;

export interface StartImpersonationCommand {
  superAdminUserId: string;
  organizationId: string;
  targetUserId: string;
  ipAddress: string;
  userAgent: string;
}

export interface StartImpersonationResult {
  sessionId: string;
  shadowAccessToken: string;
  expiresAt: Date;
  redirectUrl: string;
}

// Issues a short-lived "shadow" JWT for impersonation. The shadow JWT
// deliberately OMITS isSuperAdmin (Plan 05b invariant 4) so the same
// token cannot be replayed against admin endpoints if a super-admin
// re-navigates to admin.deqah.app in the same session.
@Injectable()
export class StartImpersonationHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async execute(cmd: StartImpersonationCommand): Promise<StartImpersonationResult> {
    const targetUser = await this.prisma.$allTenants.user.findUnique({
      where: { id: cmd.targetUserId },
      select: {
        id: true,
        email: true,
        role: true,
        customRoleId: true,
        isSuperAdmin: true,
      },
    });
    if (!targetUser) throw new NotFoundException('target_user_not_found');
    if (targetUser.isSuperAdmin) {
      // Refuse to impersonate other super-admins — escalation hazard.
      throw new ForbiddenException('cannot_impersonate_super_admin');
    }

    const membership = await this.prisma.$allTenants.membership.findFirst({
      where: {
        userId: cmd.targetUserId,
        organizationId: cmd.organizationId,
        isActive: true,
      },
      select: { id: true, organizationId: true },
    });
    if (!membership) throw new ForbiddenException('target_user_not_in_organization');

    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + IMPERSONATION_TTL_MS);

    // $allTenants.$transaction: super-admin action — operates across tenants intentionally.
    // Creates an ImpersonationSession + SuperAdminActionLog for a target user in a foreign org;
    // by definition this crosses tenant boundaries (super-admin org ≠ target org).
    const session = await this.prisma.$allTenants.$transaction(async (tx) => {
      const created = await tx.impersonationSession.create({
        data: {
          superAdminUserId: cmd.superAdminUserId,
          targetUserId: cmd.targetUserId,
          organizationId: cmd.organizationId,
          reason: null,
          startedAt,
          expiresAt,
          ipAddress: cmd.ipAddress,
          userAgent: cmd.userAgent,
        },
      });

      await tx.superAdminActionLog.create({
        data: {
          superAdminUserId: cmd.superAdminUserId,
          actionType: SuperAdminActionType.IMPERSONATE_START,
          organizationId: cmd.organizationId,
          impersonationSessionId: created.id,
          reason: null,
          metadata: { targetUserId: cmd.targetUserId, expiresAt: expiresAt.toISOString() },
          ipAddress: cmd.ipAddress,
          userAgent: cmd.userAgent,
        },
      });

      return created;
    });

    const shadowAccessToken = this.jwt.sign(
      {
        sub: targetUser.id,
        email: targetUser.email,
        role: targetUser.role,
        customRoleId: targetUser.customRoleId,
        permissions: [],
        features: [],
        organizationId: cmd.organizationId,
        membershipId: membership.id,
        // isSuperAdmin DELIBERATELY omitted — invariant 4
        scope: 'impersonation',
        impersonatedBy: cmd.superAdminUserId,
        impersonationSessionId: session.id,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        // Shadow tokens have a fixed 15-minute TTL regardless of
        // JWT_ACCESS_TTL — they outlive normal access tokens but no longer
        // than the impersonation session itself.
        expiresIn: '15m',
      },
    );

    const dashboardOrigin =
      this.config.get<string>('DASHBOARD_PUBLIC_URL') ?? 'https://app.deqah.app';

    return {
      sessionId: session.id,
      shadowAccessToken,
      expiresAt,
      redirectUrl: `${dashboardOrigin}/?_impersonation=${encodeURIComponent(shadowAccessToken)}`,
    };
  }
}
