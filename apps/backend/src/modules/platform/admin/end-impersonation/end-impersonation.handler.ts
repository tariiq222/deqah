import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SuperAdminActionType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database';
import { RedisService } from '../../../../infrastructure/cache/redis.service';

const REVOKED_TTL_SECONDS = 16 * 60; // outlive the 15-min JWT TTL by 1 min

export interface EndImpersonationCommand {
  sessionId: string;
  superAdminUserId: string;
  endedReason: 'manual' | 'expired' | 'revoked';
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class EndImpersonationHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async execute(cmd: EndImpersonationCommand) {
    // $allTenants.$transaction: super-admin action — operates across tenants intentionally.
    // Closes an ImpersonationSession that belongs to a foreign tenant; RLS is bypassed by design
    // because the session row's organizationId is the target tenant, not the super-admin's.
    await this.prisma.$allTenants.$transaction(async (tx) => {
      const session = await tx.impersonationSession.findUnique({
        where: { id: cmd.sessionId },
        select: { id: true, endedAt: true, organizationId: true, superAdminUserId: true },
      });
      if (!session) throw new NotFoundException('impersonation_session_not_found');
      if (session.endedAt) throw new ConflictException('impersonation_session_already_ended');

      await tx.impersonationSession.update({
        where: { id: cmd.sessionId },
        data: { endedAt: new Date(), endedReason: cmd.endedReason },
      });

      await tx.superAdminActionLog.create({
        data: {
          superAdminUserId: cmd.superAdminUserId,
          actionType: SuperAdminActionType.IMPERSONATE_END,
          organizationId: session.organizationId,
          impersonationSessionId: cmd.sessionId,
          reason: `Impersonation ended (${cmd.endedReason})`,
          metadata: { endedReason: cmd.endedReason },
          ipAddress: cmd.ipAddress,
          userAgent: cmd.userAgent,
        },
      });
    });

    // Revoke the shadow JWT — JwtGuard checks this key on every request
    // carrying scope='impersonation'.
    await this.redis
      .getClient()
      .set(`impersonation-revoked:${cmd.sessionId}`, '1', 'EX', REVOKED_TTL_SECONDS);
  }
}
