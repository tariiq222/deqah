import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { createHash } from 'crypto';
import { PrismaService, RlsTransactionService } from '../../../infrastructure/database';
import { SYSTEM_CONTEXT_CLS_KEY } from '../../../common/tenant/tenant.constants';

export interface VerifyEmailCommand {
  token: string;
}

export interface VerifyEmailResult {
  success: boolean;
}

@Injectable()
export class VerifyEmailHandler {
  private readonly logger = new Logger(VerifyEmailHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(cmd: VerifyEmailCommand): Promise<VerifyEmailResult> {
    const tokenSelector = cmd.token.slice(0, 8);
    const tokenHash = createHash('sha256').update(cmd.token).digest('hex');

    return this.cls.run(async () => {
      this.logger.warn('systemContext bypass activated', { context: 'VerifyEmailHandler' });
      this.cls.set(SYSTEM_CONTEXT_CLS_KEY, true);

      const record = await this.prisma.emailVerificationToken.findFirst({
        where: { tokenSelector, tokenHash, consumedAt: null },
      });

      if (!record) {
        throw new BadRequestException('Invalid or used verification link');
      }

      if (record.expiresAt.getTime() < Date.now()) {
        throw new BadRequestException('Verification link expired');
      }

      const now = new Date();
      await this.rlsTx.withBypassTransaction(async (tx) => {
        // bypassRls: email verification is a pre-auth flow with no tenant context
        await tx.emailVerificationToken.update({
          where: { id: record.id },
          data: { consumedAt: now },
        });
        await tx.user.update({
          where: { id: record.userId },
          data: { emailVerifiedAt: now },
        });
      });

      this.logger.log(`Email verified for user ${record.userId}`);
      return { success: true };
    });
  }
}
