import { Injectable, Logger } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../../infrastructure/database';
import { SUPER_ADMIN_CONTEXT_CLS_KEY } from '../../../common/tenant/tenant.constants';
import { DEFAULT_BOOKING_SETTINGS } from '../../bookings/get-booking-settings/get-booking-settings.handler';

/**
 * Auto-flips CONFIRMED bookings whose `endsAt` is older than each tenant's
 * `autoCompleteAfterHours` threshold to COMPLETED.
 *
 * Per-tenant: each organization picks its own threshold via the BookingSettings
 * row with `branchId = null` (the org-default). Previously this cron read a
 * single global row with `findFirst({ where: { branchId: null } })` and
 * applied that one tenant's threshold to ALL tenants.
 */
@Injectable()
export class BookingAutocompleteCron {
  private readonly logger = new Logger(BookingAutocompleteCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async execute(): Promise<void> {
    await this.cls.run(async () => {
      this.cls.set(SUPER_ADMIN_CONTEXT_CLS_KEY, true);

      const orgs = await this.prisma.$allTenants.organization.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true },
      });

      let totalCompleted = 0;
      for (const { id: organizationId } of orgs) {
        const settings = await this.prisma.$allTenants.bookingSettings.findFirst({
          where: { organizationId, branchId: null },
          select: { autoCompleteAfterHours: true },
        });
        const hours =
          settings?.autoCompleteAfterHours ?? DEFAULT_BOOKING_SETTINGS.autoCompleteAfterHours;
        const cutoff = new Date(Date.now() - hours * 3_600_000);

        const result = await this.prisma.$allTenants.booking.updateMany({
          where: {
            organizationId,
            status: BookingStatus.CONFIRMED,
            endsAt: { lte: cutoff },
          },
          data: {
            status: BookingStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
        totalCompleted += result.count;
      }

      if (totalCompleted > 0) {
        this.logger.log(`completed ${totalCompleted} bookings across ${orgs.length} tenants`);
      }
    });
  }
}
