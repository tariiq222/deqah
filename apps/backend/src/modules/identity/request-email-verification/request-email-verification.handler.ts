import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { SendEmailHandler } from '../../comms/send-email/send-email.handler';
import { maskEmail } from '../../../common/helpers/mask-pii.helper';

const TOKEN_TTL_MS = 30 * 60 * 1000;
const EMAIL_TEMPLATE_SLUG = 'user_email_verification';

export interface RequestEmailVerificationCommand {
  userId: string;
  organizationId?: string;
}

export interface RequestEmailVerificationResult {
  success: boolean;
}

@Injectable()
export class RequestEmailVerificationHandler {
  private readonly logger = new Logger(RequestEmailVerificationHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sendEmail: SendEmailHandler,
    private readonly config: ConfigService,
    private readonly tenant: TenantContextService,
  ) {}

  async execute(cmd: RequestEmailVerificationCommand): Promise<RequestEmailVerificationResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: cmd.userId },
      select: { id: true, email: true, name: true, emailVerifiedAt: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.emailVerifiedAt) {
      this.logger.log(`Email already verified for user ${user.id} — no-op`);
      return { success: true };
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenSelector = rawToken.slice(0, 8);
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    const organizationId = cmd.organizationId ?? this.tenant.requireOrganizationId();

    await this.prisma.emailVerificationToken.deleteMany({
      where: { userId: user.id, organizationId },
    });

    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        tokenSelector,
        expiresAt,
        organizationId,
      },
    });

    const baseUrl =
      this.config.get<string>('PUBLIC_WEBSITE_URL') ??
      this.config.get<string>('WEBSITE_URL') ??
      (process.env['NODE_ENV'] === 'production'
        ? (() => { throw new Error('PUBLIC_WEBSITE_URL must be set in production for email-verification links'); })()
        : 'http://localhost:5105');
    const verifyUrl = `${baseUrl}/verify-email?token=${rawToken}`;

    await this.sendEmail.execute({
      to: user.email,
      templateSlug: EMAIL_TEMPLATE_SLUG,
      vars: {
        userName: user.name,
        verifyUrl,
        subject: 'Verify your Deqah email',
      },
    });

    this.logger.log(`Email verification link sent to ${maskEmail(user.email)}`);
    return { success: true };
  }
}
