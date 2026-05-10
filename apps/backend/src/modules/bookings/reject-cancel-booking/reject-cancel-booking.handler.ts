import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database';
import { RlsTransactionService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { EventBusService } from '../../../infrastructure/events';
import { BookingCancelRejectedEvent } from '../events/booking-cancel-rejected.event';

export interface RejectCancelBookingCommand {
  bookingId: string;
  rejectedBy: string;
  rejectReason: string;
}

@Injectable()
export class RejectCancelBookingHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsTx: RlsTransactionService,
    private readonly tenant: TenantContextService,
    private readonly eventBus: EventBusService,
  ) {}

  async execute(cmd: RejectCancelBookingCommand) {
    const organizationId = this.tenant.requireOrganizationIdOrDefault();
    const booking = await this.prisma.booking.findFirst({
      where: { id: cmd.bookingId },
    });
    if (!booking) {
      throw new NotFoundException(`Booking ${cmd.bookingId} not found`);
    }
    if (booking.status !== ('CANCEL_REQUESTED' as BookingStatus)) {
      throw new BadRequestException(
        `Only CANCEL_REQUESTED bookings can be rejected (status: ${booking.status})`,
      );
    }

    const [updated] = await this.rlsTx.withTransaction((tx) => Promise.all([
      tx.booking.update({
        where: { id: cmd.bookingId },
        data: {
          status: BookingStatus.CONFIRMED,
          cancelReason: null,
          cancelNotes: null,
        },
      }),
      tx.bookingStatusLog.create({
        data: {
          organizationId,
          bookingId: cmd.bookingId,
          fromStatus: 'CANCEL_REQUESTED' as BookingStatus,
          toStatus: BookingStatus.CONFIRMED,
          changedBy: cmd.rejectedBy,
          reason: cmd.rejectReason,
        },
      }),
    ]));

    const event = new BookingCancelRejectedEvent({
      bookingId: booking.id,
      clientId: booking.clientId,
      employeeId: booking.employeeId,
      rejectReason: cmd.rejectReason,
    });
    await this.eventBus.publish(event.eventName, event.toEnvelope());

    return updated;
  }
}
