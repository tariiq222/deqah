import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { PlatformMailerService } from '../../../../infrastructure/mail';

const WARNING_DAYS = new Set([6, 3, 1]);

@Injectable()
export class ApiWebhooksGraceCron {
  private readonly logger = new Logger(ApiWebhooksGraceCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: PlatformMailerService,
    private readonly config: ConfigService,
  ) {}

  /** Called daily at 04:00 by the platform cron scheduler. */
  async run() {
    if (!this.config.get<boolean>('BILLING_CRON_ENABLED', false)) return;

    // SAFE: cron job running as platform-level op; uses $allTenants for cross-org webhook grace enforcement
    const subs = await this.prisma.$allTenants.subscription.findMany({
      where: {
        OR: [
          { apiAccessGraceUntil: { not: null } },
          { webhooksGraceUntil: { not: null } },
        ],
      },
      select: {
        organizationId: true,
        apiAccessGraceUntil: true,
        webhooksGraceUntil: true,
      },
    });

    for (const sub of subs) {
      const owner = await this.prisma.$allTenants.membership.findFirst({
        where: { organizationId: sub.organizationId, role: 'OWNER', isActive: true },
        select: {
          displayName: true,
          user: { select: { email: true, name: true } },
          organization: { select: { nameAr: true } },
        },
      });
      if (!owner?.user) continue;

      const ownerName = owner.displayName ?? owner.user.name ?? '';
      const orgName = owner.organization.nameAr;
      const email = owner.user.email;

      if (sub.apiAccessGraceUntil) {
        const daysLeft = Math.ceil(
          (sub.apiAccessGraceUntil.getTime() - Date.now()) / 86_400_000,
        );
        if (WARNING_DAYS.has(daysLeft)) {
          await this.mailer.sendFeatureGraceWarning(email, {
            ownerName,
            orgName,
            featureKey: 'api_access',
            featureNameAr: 'وصول API',
            featureNameEn: 'API Access',
            daysLeft,
          });
          this.logger.log(
            `Sent api_access grace warning (${daysLeft}d) to org=${sub.organizationId}`,
          );
        }
      }

      if (sub.webhooksGraceUntil) {
        const daysLeft = Math.ceil(
          (sub.webhooksGraceUntil.getTime() - Date.now()) / 86_400_000,
        );
        if (WARNING_DAYS.has(daysLeft)) {
          await this.mailer.sendFeatureGraceWarning(email, {
            ownerName,
            orgName,
            featureKey: 'webhooks',
            featureNameAr: 'Webhooks',
            featureNameEn: 'Webhooks',
            daysLeft,
          });
          this.logger.log(
            `Sent webhooks grace warning (${daysLeft}d) to org=${sub.organizationId}`,
          );
        }
      }
    }
  }
}
