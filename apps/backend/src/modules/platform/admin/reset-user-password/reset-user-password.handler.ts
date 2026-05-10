import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { SuperAdminActionType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database';
import { PasswordService } from '../../../identity/shared/password.service';
import { SmtpService } from '../../../../infrastructure/mail';

export interface ResetUserPasswordCommand {
  targetUserId: string;
  superAdminUserId: string;
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class ResetUserPasswordHandler {
  private readonly logger = new Logger(ResetUserPasswordHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly smtp: SmtpService,
  ) {}

  async execute(cmd: ResetUserPasswordCommand): Promise<{ tempPasswordIssued: boolean }> {
    const user = await this.prisma.$allTenants.user.findUnique({
      where: { id: cmd.targetUserId },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new NotFoundException('user_not_found');

    const tempPassword = randomBytes(12).toString('base64url');
    const passwordHash = await this.passwords.hash(tempPassword);

    // $allTenants.$transaction: super-admin action — operates across tenants intentionally.
    // Resets the password hash on a User row that may belong to any tenant; User rows are
    // global (no organizationId) and are inaccessible under RLS in a normal tenant context.
    await this.prisma.$allTenants.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: cmd.targetUserId },
        data: { passwordHash },
      });

      await tx.superAdminActionLog.create({
        data: {
          superAdminUserId: cmd.superAdminUserId,
          actionType: SuperAdminActionType.RESET_PASSWORD,
          organizationId: null,
          reason: null,
          metadata: { targetUserId: cmd.targetUserId },
          ipAddress: cmd.ipAddress,
          userAgent: cmd.userAgent,
        },
      });
    });

    if (this.smtp.isAvailable()) {
      await this.smtp.sendMail(
        user.email,
        'Deqah — Temporary password issued',
        this.buildEmailHtml(user.name, tempPassword),
      );
    } else {
      this.logger.warn(
        `SMTP unavailable — temp password for ${user.email} not delivered (logged out-of-band).`,
      );
    }

    return { tempPasswordIssued: true };
  }

  private buildEmailHtml(name: string, tempPassword: string): string {
    return `
      <p>Hello ${this.escape(name)},</p>
      <p>A Deqah administrator issued you a temporary password:</p>
      <p style="font-family:monospace;font-size:18px"><strong>${this.escape(tempPassword)}</strong></p>
      <p>Please sign in and change it immediately. If you did not expect this email, contact support.</p>
    `;
  }

  private escape(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}
