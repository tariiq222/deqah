import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';
import { EventBusService } from '../../../infrastructure/events';
import { BookingCancelledPayload } from '../events/booking-cancelled.event';

/**
 * Subscribes to bookings.booking.cancelled and promotes the next WAITING
 * waitlist entry for the same (employee, service, branch) tuple.
 *
 * The EventBusService already sets a tenant CLS context from organizationId
 * in the payload before invoking this handler, so scoped Prisma queries work
 * without additional CLS setup.
 */
@Injectable()
export class OnBookingCancelledPromoteWaitlistHandler {
  private readonly logger = new Logger(OnBookingCancelledPromoteWaitlistHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  register(): void {
    this.eventBus.subscribe<BookingCancelledPayload>(
      'bookings.booking.cancelled',
      async (envelope) => {
        const { organizationId, bookingId, employeeId } = envelope.payload;

        const cancelledBooking = await this.prisma.booking.findFirst({
          where: { id: bookingId, organizationId },
          select: { serviceId: true, branchId: true },
        });

        if (!cancelledBooking) {
          this.logger.warn(`Booking ${bookingId} not found for waitlist promotion`);
          return;
        }

        const { serviceId, branchId } = cancelledBooking;

        const next = await this.prisma.waitlistEntry.findFirst({
          where: {
            organizationId,
            employeeId,
            serviceId,
            branchId,
            status: 'WAITING',
          },
          orderBy: { createdAt: 'asc' },
        });

        if (!next) return;

        await this.prisma.waitlistEntry.update({
          where: { id: next.id },
          data: { status: 'PROMOTED', promotedAt: new Date() },
        });

        this.logger.log(
          `Promoted waitlist entry ${next.id} (client ${next.clientId}) after booking ${bookingId} was cancelled`,
        );
      },
    );
  }
}
