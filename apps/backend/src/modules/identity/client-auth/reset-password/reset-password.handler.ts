import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { OtpPurpose, OtpChannel } from '@prisma/client';
import { PrismaService, RlsTransactionService } from '../../../../infrastructure/database';
import { OtpSessionService } from '../../otp/otp-session.service';
import { PasswordService } from '../../shared/password.service';
import { ResetPasswordDto } from './reset-password.dto';
import { TenantContextService } from '../../../../common/tenant';
import { RlsHelper } from '../../../../common/tenant/rls.helper';
import { PasswordHistoryService } from '../shared/password-history.service';

@Injectable()
export class ResetPasswordHandler {
  private readonly logger = new Logger(ResetPasswordHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otpSession: OtpSessionService,
    private readonly passwords: PasswordService,
    private readonly tenant: TenantContextService,
    private readonly passwordHistory: PasswordHistoryService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(dto: ResetPasswordDto): Promise<void> {
    const session = this.otpSession.verifySession(dto.sessionToken);

    if (!session) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    if (session.purpose !== OtpPurpose.CLIENT_PASSWORD_RESET) {
      throw new UnauthorizedException('Invalid session purpose');
    }

    const now = new Date();
    const expiresAt = session.exp
      ? new Date(session.exp * 1000)
      : new Date(now.getTime() + 30 * 60 * 1000);

    const organizationId = session.organizationId ?? this.tenant.requireOrganizationIdOrDefault();

    const identifier = session.identifier;
    const isEmail = session.channel === OtpChannel.EMAIL;
    const existing = isEmail
      ? await this.prisma.client.findFirst({ where: { organizationId, email: identifier, deletedAt: null } })
      : await this.prisma.client.findFirst({ where: { organizationId, phone: identifier, deletedAt: null } });

    if (!existing) {
      throw new UnauthorizedException('Invalid session');
    }

    await this.passwordHistory.assertNotReused(
      existing.id,
      organizationId,
      dto.newPassword,
      existing.passwordHash,
    );

    const passwordHash = await this.passwords.hash(dto.newPassword);

    await this.rlsTx.withTransaction(async (tx) => {
      // Burn OTP session — unique constraint on jti prevents replay
      try {
        await tx.usedOtpSession.create({
          data: {
            jti: session.jti,
            organizationId,
            consumedAt: now,
            expiresAt,
          },
        });
      } catch {
        throw new UnauthorizedException('Session already used');
      }

      // Update password
      await tx.client.update({
        where: { id: existing.id },
        data: { passwordHash, loginAttempts: 0, lockoutUntil: null },
      });

      // Record new password in history (trims to HISTORY_DEPTH)
      await this.passwordHistory.record(tx, existing.id, organizationId, passwordHash);

      // Revoke all existing refresh tokens for this client
      await tx.clientRefreshToken.updateMany({
        where: { clientId: existing.id, organizationId, revokedAt: null },
        data: { revokedAt: now },
      });
    });

    this.logger.log(`Password reset completed for session identifier: ${session.identifier}`);
  }
}
