import { Injectable, BadRequestException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { fetchBookingOrFail } from '../booking-lifecycle.helper';

export interface CheckInBookingCommand {
  bookingId: string;
  changedBy: string;
}

/** Receptionist marks client as arrived — transitions CONFIRMED → CONFIRMED with checkedInAt timestamp. */
@Injectable()
export class CheckInBookingHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async execute(cmd: CheckInBookingCommand) {
    const organizationId = this.tenant.requireOrganizationIdOrDefault();
    const booking = await fetchBookingOrFail(this.prisma, cmd.bookingId, [BookingStatus.CONFIRMED], 'checked in');
    if (booking.checkedInAt) {
      throw new BadRequestException('Booking is already checked in');
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.booking.update({
        where: { id: cmd.bookingId, organizationId },
        data: { checkedInAt: new Date() },
      }),
      this.prisma.bookingStatusLog.create({
        data: {
          organizationId,
          bookingId: cmd.bookingId,
          fromStatus: BookingStatus.CONFIRMED,
          toStatus: BookingStatus.CONFIRMED,
          changedBy: cmd.changedBy,
          reason: 'checked-in',
        },
      }),
    ]);
    return updated;
  }
}
