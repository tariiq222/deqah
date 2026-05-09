import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { EventBusService } from '../../../infrastructure/events';
import { BookingConfirmedEvent } from '../events/booking-confirmed.event';
import { CreateZoomMeetingHandler } from '../create-zoom-meeting/create-zoom-meeting.handler';
import { fetchBookingOrFail } from '../booking-lifecycle.helper';

export interface ConfirmBookingCommand {
  bookingId: string;
  changedBy: string;
}

@Injectable()
export class ConfirmBookingHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly eventBus: EventBusService,
    private readonly createZoomMeeting: CreateZoomMeetingHandler,
  ) {}

  async execute(cmd: ConfirmBookingCommand) {
    const organizationId = this.tenant.requireOrganizationIdOrDefault();
    const booking = await fetchBookingOrFail(this.prisma, cmd.bookingId, [BookingStatus.PENDING], 'confirmed');

    const [updated] = await this.prisma.$transaction([
      this.prisma.booking.update({
        where: { id: cmd.bookingId, organizationId },
        data: { status: BookingStatus.CONFIRMED, confirmedAt: new Date() },
      }),
      this.prisma.bookingStatusLog.create({
        data: {
          organizationId,
          bookingId: cmd.bookingId,
          fromStatus: booking.status,
          toStatus: BookingStatus.CONFIRMED,
          changedBy: cmd.changedBy,
        },
      }),
    ]);

    const event = new BookingConfirmedEvent({
      bookingId: booking.id,
      clientId: booking.clientId,
      employeeId: booking.employeeId,
      branchId: booking.branchId,
      serviceId: booking.serviceId,
      scheduledAt: booking.scheduledAt,
      price: Number(booking.price),
      currency: booking.currency,
      couponCode: (booking as Record<string, unknown>).couponCode as string | null ?? null,
      discountedPrice: (booking as Record<string, unknown>).discountedPrice
        ? Number((booking as Record<string, unknown>).discountedPrice)
        : null,
      bookingType: booking.bookingType,
    });
    await this.eventBus.publish(event.eventName, event.toEnvelope());

    if ((booking.bookingType as string) === 'ONLINE') {
      try {
        await this.createZoomMeeting.execute({
          bookingId: cmd.bookingId,
        });
      } catch {
        // Never throw from here; the handler already persists FAILED status internally for Zoom API errors.
        // This catch handles unexpected non-Zoom exceptions (e.g. DB down during update).
      }
    }

    return updated;
  }
}
