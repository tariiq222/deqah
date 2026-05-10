import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService, RlsTransactionService } from '../../../../infrastructure/database';
import { PasswordService } from '../../shared/password.service';
import { PerformPasswordResetDto } from './perform-password-reset.dto';

@Injectable()
export class PerformPasswordResetHandler {
  private readonly logger = new Logger(PerformPasswordResetHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(dto: PerformPasswordResetDto): Promise<void> {
    const tokenSelector = dto.token.slice(0, 8);
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');

    const record = await this.prisma.passwordResetToken.findFirst({
      where: { tokenSelector, tokenHash },
    });

    // Single error message for all terminal states (not-found / consumed / expired)
    // to prevent attackers from probing whether a userId already had a successful reset.
    const REJECT_MSG = 'Invalid or expired reset link';
    if (!record) {
      throw new UnauthorizedException(REJECT_MSG);
    }
    if (record.consumedAt) {
      throw new UnauthorizedException(REJECT_MSG);
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException(REJECT_MSG);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: record.userId },
      select: { passwordHash: true },
    });
    if (user?.passwordHash && await this.passwords.verify(dto.newPassword, user.passwordHash)) {
      throw new BadRequestException('PASSWORD_REUSED');
    }

    const passwordHash = await this.passwords.hash(dto.newPassword);
    const now = new Date();

    await this.rlsTx.withBypassTransaction(async (tx) => {
      // bypassRls: pre-auth flow — caller has only the reset token, no tenant context.
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      });
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { consumedAt: now },
      });
      await tx.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: now },
      });
    });

    this.logger.log(`Password reset completed for user ${record.userId}`);
  }
}
