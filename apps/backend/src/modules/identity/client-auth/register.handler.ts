import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { Request } from 'express';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../../infrastructure/database';
import { OtpSessionService } from '../otp/otp-session.service';
import { ClientTokenService } from '../shared/client-token.service';
import { PasswordService } from '../shared/password.service';
import { RegisterDto } from './register.dto';
import { OtpPurpose, OtpChannel } from '@prisma/client';
import { TenantContextService } from '../../../common/tenant';
import { maskIdentifier } from '../../../common/helpers/mask-pii.helper';

@Injectable()
export class RegisterHandler {
  private readonly logger = new Logger(RegisterHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otpSession: OtpSessionService,
    private readonly clientTokens: ClientTokenService,
    private readonly passwords: PasswordService,
    private readonly tenant: TenantContextService,
  ) {}

  async execute(dto: RegisterDto, rawRequest: Request) {
    const authHeader = rawRequest.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing OTP session token');
    }

    const token = authHeader.slice(7);
    const payload = this.otpSession.verifySession(token);

    if (!payload) {
      throw new UnauthorizedException('Invalid or expired OTP session');
    }

    if (payload.purpose !== OtpPurpose.CLIENT_LOGIN) {
      throw new UnauthorizedException('OTP session purpose mismatch');
    }

    const isEmailChannel = payload.channel === OtpChannel.EMAIL;
    const identifier = payload.identifier;
    const organizationId = this.tenant.requireOrganizationIdOrDefault();

    const passwordHash = await this.passwords.hash(dto.password);

    const existing = isEmailChannel
      ? await this.prisma.client.findFirst({ where: { organizationId, email: identifier } })
      : await this.prisma.client.findFirst({ where: { organizationId, phone: identifier } });

    let clientId: string;

    if (existing) {
      if (existing.passwordHash) {
        throw new BadRequestException('Account already has a password. Please log in instead.');
      }

      const updated = await this.prisma.client.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          emailVerified: isEmailChannel ? new Date() : existing.emailVerified,
          phoneVerified: !isEmailChannel ? new Date() : existing.phoneVerified,
          name: dto.name ?? existing.name,
          accountType: 'FULL',
          claimedAt: new Date(),
        },
      });
      clientId = updated.id;
      this.logger.log(`Guest-to-account merge: client ${clientId} (${maskIdentifier(identifier)})`);
    } else {
      const created = await this.prisma.client.create({
        data: {
          organizationId,
          email: isEmailChannel ? identifier : null,
          phone: !isEmailChannel ? identifier : null,
          name: dto.name ?? identifier,
          passwordHash,
          emailVerified: isEmailChannel ? new Date() : null,
          phoneVerified: !isEmailChannel ? new Date() : null,
          accountType: 'FULL',
          claimedAt: new Date(),
        },
      });
      clientId = created.id;
      this.logger.log(`New client registration: ${clientId} (${maskIdentifier(identifier)})`);
    }

    const tokens = await this.clientTokens.issueTokenPair(
      { id: clientId, email: isEmailChannel ? identifier : null },
      { organizationId },
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.rawRefresh,
      clientId,
    };
  }
}
