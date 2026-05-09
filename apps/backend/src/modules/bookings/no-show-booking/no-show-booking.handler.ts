import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { fetchBookingOrFail } from '../booking-lifecycle.helper';

export interface NoShowBookingCommand {
  bookingId: string;
  changedBy: string;
}

@Injectable()
export class NoShowBookingHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async execute(cmd: NoShowBookingCommand) {
    const organizationId = this.tenant.requireOrganizationIdOrDefault();
    const booking = await fetchBookingOrFail(this.prisma, cmd.bookingId, [BookingStatus.CONFIRMED], 'marked as no-show');

    const [updated] = await this.prisma.$transaction([
      this.prisma.booking.update({
        where: { id: cmd.bookingId, organizationId },
        data: { status: BookingStatus.NO_SHOW, noShowAt: new Date() },
      }),
      this.prisma.bookingStatusLog.create({
        data: {
          organizationId,
          bookingId: cmd.bookingId,
          fromStatus: booking.status,
          toStatus: BookingStatus.NO_SHOW,
          changedBy: cmd.changedBy,
        },
      }),
    ]);
    return updated;
  }
}
