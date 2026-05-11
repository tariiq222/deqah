import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { PlatformMailerService } from '../../../../infrastructure/mail';

@Injectable()
export class CustomDomainGraceCron {
  private readonly logger = new Logger(CustomDomainGraceCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: PlatformMailerService,
    private readonly config: ConfigService,
  ) {}

  /** Called daily at 03:00 by the platform cron scheduler. */
  async run() {
    if (!this.config.get<boolean>('BILLING_CRON_ENABLED', false)) return;

    // SAFE: cron job running as platform-level op; uses $allTenants for cross-org grace-period enforcement
    const orgs = await this.prisma.$allTenants.organizationSettings.findMany({
      where: { customDomainGraceUntil: { not: null } },
      select: {
        organizationId: true,
        customDomainGraceUntil: true,
      },
    });

    for (const org of orgs) {
      const daysLeft = Math.ceil(
        (org.customDomainGraceUntil!.getTime() - Date.now()) / 86_400_000,
      );

      const owner = await this.prisma.$allTenants.membership.findFirst({
        where: { organizationId: org.organizationId, role: 'OWNER', isActive: true },
        select: {
          displayName: true,
          user: { select: { email: true, name: true } },
          organization: { select: { nameAr: true } },
        },
      });

      if (daysLeft <= 0) {
        await this.revertDomain(org.organizationId);
        if (owner?.user) {
          await this.mailer.sendFeatureGraceExpired(owner.user.email, {
            ownerName: owner.displayName ?? owner.user.name ?? '',
            orgName: owner.organization.nameAr,
            featureKey: 'custom_domain',
            featureNameAr: 'النطاق المخصص',
            featureNameEn: 'Custom Domain',
          });
        }
        this.logger.log(`Reverted custom domain for org=${org.organizationId}`);
      } else if (daysLeft <= 7) {
        if (owner?.user) {
          await this.mailer.sendFeatureGraceWarning(owner.user.email, {
            ownerName: owner.displayName ?? owner.user.name ?? '',
            orgName: owner.organization.nameAr,
            featureKey: 'custom_domain',
            featureNameAr: 'النطاق المخصص',
            featureNameEn: 'Custom Domain',
            daysLeft,
          });
        }
      }
    }
  }

  private async revertDomain(organizationId: string) {
    await this.prisma.$allTenants.organizationSettings.update({
      where: { organizationId },
      data: { customDomainGraceUntil: null },
    });
  }
}
