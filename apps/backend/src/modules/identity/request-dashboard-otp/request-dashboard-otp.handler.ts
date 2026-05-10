import {
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { OtpChannel, OtpPurpose } from '@prisma/client';
import { PrismaService, RlsTransactionService } from '../../../infrastructure/database';
import { NotificationChannelRegistry } from '../../comms/notification-channel/notification-channel-registry';
import { detectChannel, normalizeIdentifier, AuthChannel } from '../shared/identifier-detector';
import type { RequestDashboardOtpCommand } from './request-dashboard-otp.command';

const OTP_EXPIRY_MINUTES = 5;
const OTP_MIN = 100_000;
const OTP_MAX = 1_000_000;
const MAX_REQUESTS_PER_IDENTIFIER_PER_HOUR = 5;

@Injectable()
export class RequestDashboardOtpHandler {
  private readonly logger = new Logger(RequestDashboardOtpHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channelRegistry: NotificationChannelRegistry,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(cmd: RequestDashboardOtpCommand): Promise<{ success: boolean }> {
    const channel: AuthChannel = detectChannel(cmd.identifier);
    const identifier = normalizeIdentifier(cmd.identifier, channel);
    const otpChannel: OtpChannel = channel === 'EMAIL' ? OtpChannel.EMAIL : OtpChannel.SMS;

    const recentCount = await this.prisma.otpCode.count({
      where: {
        identifier,
        purpose: OtpPurpose.DASHBOARD_LOGIN,
        createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (recentCount >= MAX_REQUESTS_PER_IDENTIFIER_PER_HOUR) {
      throw new HttpException(
        'Too many OTP requests for this identifier',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const rawCode = randomInt(OTP_MIN, OTP_MAX).toString();
    const codeHash = await bcrypt.hash(rawCode, 10);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    const created = await this.rlsTx.withBypassTransaction(async (tx) => {
      // bypassRls: dashboard login OTPs have no tenant context — they are pre-auth cross-org lookups
      await tx.otpCode.updateMany({
        where: {
          identifier,
          purpose: OtpPurpose.DASHBOARD_LOGIN,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });

      return tx.otpCode.create({
        data: {
          channel: otpChannel,
          identifier,
          codeHash,
          purpose: OtpPurpose.DASHBOARD_LOGIN,
          expiresAt,
        },
        select: { id: true },
      });
    });

    try {
      const channelService = this.channelRegistry.resolve(otpChannel);
      await channelService.send(identifier, rawCode);
    } catch (err) {
      this.logger.error(
        `Failed to send OTP via ${otpChannel} to ${identifier}`,
        err,
      );
      try {
        await this.prisma.otpCode.delete({ where: { id: created.id } });
      } catch (cleanupErr) {
        this.logger.error(
          `Failed to clean up OTP row ${created.id} after send failure`,
          cleanupErr,
        );
      }
      throw new ServiceUnavailableException('Failed to send OTP. Please try again.');
    }

    return { success: true };
  }
}