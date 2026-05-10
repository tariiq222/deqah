import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { BookingStatus, RefundType } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database';
import { RlsTransactionService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { EventBusService } from '../../../infrastructure/events';
import { GetBookingSettingsHandler } from '../get-booking-settings/get-booking-settings.handler';
import { ClientCancelBookingDto } from './client-cancel-booking.dto';
import { BookingCancelledEvent } from '../events/booking-cancelled.event';

export type ClientCancelCommand = ClientCancelBookingDto & {
  bookingId: string;
  clientId: string;
};

@Injectable()
export class ClientCancelBookingHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsTx: RlsTransactionService,
    private readonly tenant: TenantContextService,
    private readonly settingsHandler: GetBookingSettingsHandler,
    private readonly eventBus: EventBusService,
  ) {}

  async execute(cmd: ClientCancelCommand) {
    const organizationId = this.tenant.requireOrganizationIdOrDefault();
    const booking = await this.prisma.booking.findUnique({
      where: { id: cmd.bookingId },
    });

    if (!booking) {
      throw new NotFoundException(`Booking ${cmd.bookingId} not found`);
    }

    if (booking.clientId !== cmd.clientId) {
      throw new ForbiddenException('You do not own this booking');
    }

    const cancellable: BookingStatus[] = [
      BookingStatus.PENDING,
      BookingStatus.CONFIRMED,
      BookingStatus.AWAITING_PAYMENT,
    ];
    if (!cancellable.includes(booking.status)) {
      throw new BadRequestException(`Booking cannot be cancelled (status: ${booking.status})`);
    }

    const settings = await this.settingsHandler.execute({ branchId: booking.branchId });
    const hoursUntilBooking = (booking.scheduledAt.getTime() - Date.now()) / 3_600_000;

    if (hoursUntilBooking < settings.freeCancelBeforeHours) {
      const [updated] = await this.rlsTx.withTransaction((tx) => Promise.all([
        tx.booking.update({
          where: { id: cmd.bookingId },
          data: {
            status: BookingStatus.CANCEL_REQUESTED,
            cancelNotes: cmd.reason ?? null,
          },
        }),
        tx.bookingStatusLog.create({
          data: {
            organizationId,
            bookingId: cmd.bookingId,
            fromStatus: booking.status,
            toStatus: BookingStatus.CANCEL_REQUESTED,
            changedBy: cmd.clientId,
            reason: cmd.reason ?? 'CLIENT_CANCEL_WINDOW_EXPIRED',
          },
        }),
      ]));
      return { status: 'CANCEL_REQUESTED', booking: updated, requiresApproval: true };
    }

    const refundType = hoursUntilBooking >= settings.freeCancelBeforeHours
      ? settings.freeCancelRefundType
      : RefundType.NONE;

    const [updated] = await this.rlsTx.withTransaction((tx) => Promise.all([
      tx.booking.update({
        where: { id: cmd.bookingId },
        data: {
          status: BookingStatus.CANCELLED,
          cancelReason: 'CLIENT_REQUESTED',
          cancelNotes: cmd.reason ?? null,
          cancelledAt: new Date(),
        },
      }),
      tx.bookingStatusLog.create({
        data: {
          organizationId,
          bookingId: cmd.bookingId,
          fromStatus: booking.status,
          toStatus: BookingStatus.CANCELLED,
          changedBy: cmd.clientId,
          reason: cmd.reason ?? 'CLIENT_CANCEL',
        },
      }),
    ]));

    const completedPayment = await this.prisma.payment.findFirst({
      where: { invoice: { bookingId: booking.id }, status: 'COMPLETED' },
      select: { id: true },
    });

    const event = new BookingCancelledEvent({
      bookingId: booking.id,
      clientId: booking.clientId,
      employeeId: booking.employeeId,
      reason: 'CLIENT_REQUESTED' as never,
      cancelNotes: cmd.reason ?? undefined,
      refundType,
      paymentId: completedPayment?.id ?? null,
    });
    await this.eventBus.publish(event.eventName, event.toEnvelope());

    return { status: 'CANCELLED', booking: updated, requiresApproval: false };
  }
}
