import { Injectable, Logger } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../../infrastructure/database';
import { SUPER_ADMIN_CONTEXT_CLS_KEY } from '../../../common/tenant/tenant.constants';
import { LaunchFlags } from '../../platform/billing/feature-flags/launch-flags';
import { withCronLeader } from '../../../common/helpers/cron-leader.helper';

@Injectable()
export class BookingExpiryCron {
  private readonly logger = new Logger(BookingExpiryCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: LaunchFlags,
    private readonly cls: ClsService,
  ) {}

  async execute(): Promise<void> {
    if (!this.flags.bookingExpiryEnabled) {
      return this.legacyExpire();
    }
    return this.enhancedExpire();
  }

  /**
   * Legacy path used when BOOKING_EXPIRY_CRON_ENABLED is off. Preserves
   * the pre-launch-readiness behavior so the flag flip is the only thing
   * that activates the new cross-tenant cron.
   */
  private async legacyExpire(): Promise<void> {
    // SAFE: cron job running as platform-level op; sets SUPER_ADMIN_CONTEXT explicitly.
    await this.cls.run(async () => {
      this.cls.set(SUPER_ADMIN_CONTEXT_CLS_KEY, true);
      await withCronLeader(this.prisma, 'booking-expiry', async () => {
        const now = new Date();
        const result = await this.prisma.$allTenants.booking.updateMany({
          where: {
            status: BookingStatus.PENDING,
            expiresAt: { lte: now },
          },
          data: { status: BookingStatus.EXPIRED },
        });
        if (result.count > 0) {
          this.logger.log(`expired ${result.count} bookings (legacy)`);
        }
      });
    });
  }

  private async enhancedExpire(): Promise<void> {
    // SAFE: cron job running as platform-level op; sets SUPER_ADMIN_CONTEXT explicitly.
    await this.cls.run(async () => {
      this.cls.set(SUPER_ADMIN_CONTEXT_CLS_KEY, true);
      this.logger.log('systemContext: booking-expiry tick');

      await withCronLeader(this.prisma, 'booking-expiry', async () => {
        const now = new Date();
        const stale = await this.prisma.$allTenants.booking.findMany({
          where: {
            expiresAt: { lt: now },
            status: {
              in: [
                BookingStatus.PENDING,
                BookingStatus.AWAITING_PAYMENT,
                BookingStatus.PENDING_GROUP_FILL,
              ],
            },
          },
          select: { id: true, organizationId: true, couponCode: true },
        });
        if (stale.length === 0) return;

        const ids = stale.map((b) => b.id);
        await this.prisma.$allTenants.booking.updateMany({
          where: { id: { in: ids } },
          data: { status: BookingStatus.EXPIRED },
        });

        for (const b of stale) {
          if (!b.couponCode) continue;
          await this.prisma.$allTenants.coupon.updateMany({
            where: {
              code: b.couponCode,
              organizationId: b.organizationId,
              usedCount: { gt: 0 },
            },
            data: { usedCount: { decrement: 1 } },
          });
        }

        this.logger.log(`expired ${ids.length} bookings`);
      });
    });
  }
}
