import { Injectable, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../../infrastructure/database';
import { SYSTEM_CONTEXT_CLS_KEY } from '../../../common/tenant/tenant.constants';
import { VerifyOtpDto } from './verify-otp.dto';
import { OtpSessionService } from './otp-session.service';

const LOCKOUT_WINDOW_MINUTES = 15;

export type VerifyOtpCommand = VerifyOtpDto;

@Injectable()
export class VerifyOtpHandler {
  private readonly logger = new Logger(VerifyOtpHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otpSession: OtpSessionService,
    private readonly cls: ClsService,
  ) {}

  async execute(dto: VerifyOtpCommand): Promise<{ sessionToken: string }> {
    const orgId = dto.organizationId ?? null;

    return this.cls.run(async () => {
      this.logger.warn('systemContext bypass activated', { context: 'VerifyOtpHandler' });
      this.cls.set(SYSTEM_CONTEXT_CLS_KEY, true);

      const otpRecord = await this.prisma.otpCode.findFirst({
        where: {
          organizationId: orgId,
          identifier: dto.identifier,
          purpose: dto.purpose,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!otpRecord) {
        throw new BadRequestException('Invalid or expired OTP code');
      }

      const now = new Date();
      if (otpRecord.lockedUntil && otpRecord.lockedUntil > now) {
        throw new BadRequestException('OTP_LOCKED_OUT');
      }

      if (otpRecord.attempts >= otpRecord.maxAttempts) {
        throw new BadRequestException('Too many failed attempts. Please request a new code.');
      }

      const codeMatch = await bcrypt.compare(dto.code, otpRecord.codeHash);
      if (!codeMatch) {
        await this.prisma.otpCode.update({
          where: { id: otpRecord.id },
          data: { attempts: { increment: 1 } },
        });
        throw new UnauthorizedException('Invalid OTP code');
      }

      const consumed = await this.prisma.otpCode.updateMany({
        where: {
          id: otpRecord.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });

      if (consumed.count === 0) {
        throw new BadRequestException('OTP already used or expired');
      }

      // Verification marks the client as verified for this org (SaaS-02h)
      if (otpRecord.channel === 'EMAIL') {
        await this.prisma.client.updateMany({
          where: {
            ...(orgId ? { organizationId: orgId } : {}),
            email: dto.identifier,
          },
          data: { emailVerified: new Date() },
        });
      } else if (otpRecord.channel === 'SMS') {
        await this.prisma.client.updateMany({
          where: {
            ...(orgId ? { organizationId: orgId } : {}),
            phone: dto.identifier,
          },
          data: { phoneVerified: new Date() },
        });
      }

      const sessionToken = await this.otpSession.signSession({
        organizationId: orgId,
        identifier: dto.identifier,
        purpose: dto.purpose,
        channel: otpRecord.channel,
      });

      return { sessionToken };
    });
  }
}
