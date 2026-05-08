import { Injectable, Logger } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../../infrastructure/database';
import { SUPER_ADMIN_CONTEXT_CLS_KEY } from '../../../common/tenant/tenant.constants';
import { DEFAULT_BOOKING_SETTINGS } from '../../bookings/get-booking-settings/get-booking-settings.handler';

/**
 * Auto-flips CONFIRMED bookings whose scheduledAt is older than each tenant's
 * `autoNoShowAfterMinutes` threshold to NO_SHOW.
 *
 * Per-tenant: each organization picks its own threshold via the BookingSettings
 * row with `branchId = null` (the org-default). Previously this cron read a
 * single global row with `findFirst({ where: { branchId: null } })` and
 * applied that one tenant's threshold to ALL tenants — a tenant setting 5
 * minutes would incorrectly no-show every other tenant's bookings.
 */
@Injectable()
export class BookingNoShowCron {
  private readonly logger = new Logger(BookingNoShowCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async execute(): Promise<void> {
    await this.cls.run(async () => {
      this.cls.set(SUPER_ADMIN_CONTEXT_CLS_KEY, true);

      // Iterate one tenant at a time so each org's `autoNoShowAfterMinutes`
      // is honored against ITS OWN bookings only. Inactive/suspended orgs
      // are skipped — their bookings should not change state under cron.
      const orgs = await this.prisma.$allTenants.organization.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true },
      });

      let totalFlipped = 0;
      for (const { id: organizationId } of orgs) {
        const settings = await this.prisma.$allTenants.bookingSettings.findFirst({
          where: { organizationId, branchId: null },
          select: { autoNoShowAfterMinutes: true },
        });
        const minutes =
          settings?.autoNoShowAfterMinutes ?? DEFAULT_BOOKING_SETTINGS.autoNoShowAfterMinutes;
        const cutoff = new Date(Date.now() - minutes * 60_000);

        const result = await this.prisma.$allTenants.booking.updateMany({
          where: {
            organizationId,
            status: BookingStatus.CONFIRMED,
            scheduledAt: { lte: cutoff },
            checkedInAt: null,
          },
          data: {
            status: BookingStatus.NO_SHOW,
            noShowAt: new Date(),
          },
        });
        totalFlipped += result.count;
      }

      if (totalFlipped > 0) {
        this.logger.log(`marked ${totalFlipped} as NO_SHOW across ${orgs.length} tenants`);
      }
    });
  }
}
