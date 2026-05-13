import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../../../../infrastructure/database';
import { PlatformMailerService } from '../../../../infrastructure/mail/platform-mailer.service';
import { RequestPasswordResetDto } from './request-password-reset.dto';
import { maskEmail } from '../../../../common/helpers/mask-pii.helper';

const TOKEN_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class RequestPasswordResetHandler {
  private readonly logger = new Logger(RequestPasswordResetHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly platformMailer: PlatformMailerService,
    private readonly config: ConfigService,
  ) {}

  async execute(dto: RequestPasswordResetDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, email: true, name: true, isActive: true, isSuperAdmin: true },
    });

    if (!user || !user.isActive) {
      this.logger.log('Password reset requested for unknown or inactive account');
      return;
    }

    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const rawToken = randomBytes(32).toString('hex');
    const tokenSelector = rawToken.slice(0, 8);
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        tokenSelector,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });

    // Super-admins reset via the admin app; all other staff via dashboard.
    // TODO: add ADMIN_URL env var so super-admin reset links point to the admin app host.
    const baseUrl =
      this.config.get<string>('PASSWORD_RESET_BASE_URL') ??
      this.config.get<string>('DASHBOARD_PUBLIC_URL') ??
      this.config.get<string>('PLATFORM_DASHBOARD_URL') ??
      this.config.get<string>('DASHBOARD_URL') ??
      (process.env['NODE_ENV'] === 'production'
        ? (() => { throw new Error('DASHBOARD_PUBLIC_URL must be set in production for password-reset emails'); })()
        : 'http://localhost:5103');
    const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;

    await this.platformMailer.sendStaffPasswordReset({
      to: user.email,
      userName: user.name,
      resetUrl,
    });

    this.logger.log(`Password reset email sent to ${maskEmail(user.email)}`);
  }
}
