import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { fetchBookingOrFail } from '../booking-lifecycle.helper';

export interface ExpireBookingCommand {
  bookingId: string;
  changedBy: string;
}

@Injectable()
export class ExpireBookingHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async execute(cmd: ExpireBookingCommand) {
    const organizationId = this.tenant.requireOrganizationIdOrDefault();
    const booking = await fetchBookingOrFail(
      this.prisma,
      cmd.bookingId,
      [BookingStatus.PENDING, BookingStatus.PENDING_GROUP_FILL, BookingStatus.AWAITING_PAYMENT],
      'expired',
    );

    const [updated] = await this.prisma.$transaction([
      this.prisma.booking.update({
        where: { id: cmd.bookingId, organizationId },
        data: { status: BookingStatus.EXPIRED, expiresAt: new Date() },
      }),
      this.prisma.bookingStatusLog.create({
        data: {
          organizationId,
          bookingId: cmd.bookingId,
          fromStatus: booking.status,
          toStatus: BookingStatus.EXPIRED,
          changedBy: cmd.changedBy,
        },
      }),
    ]);
    return updated;
  }
}
