import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { BookingStatus, CancellationReason, RefundType } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database';
import { RlsTransactionService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { EventBusService } from '../../../infrastructure/events';
import { GetBookingSettingsHandler } from '../get-booking-settings/get-booking-settings.handler';
import { ClientCancelBookingDto } from './client-cancel-booking.dto';
import { BookingCancelledEvent } from '../events/booking-cancelled.event';
import { RefundPaymentHandler } from '../../finance/refund-payment/refund-payment.handler';

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
    private readonly refundHandler: RefundPaymentHandler,
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

    let refundRequestId: string | null = null;
    let paymentId: string | null = null;
    let idempotencyKey: string | null = null;

    const updated = await this.rlsTx.withTransaction(async (tx) => {
      const cancelled = await tx.booking.update({
        where: { id: cmd.bookingId },
        data: {
          status: BookingStatus.CANCELLED,
          cancelReason: 'CLIENT_REQUESTED',
          cancelNotes: cmd.reason ?? null,
          cancelledAt: new Date(),
        },
      });
      await tx.bookingStatusLog.create({
        data: {
          organizationId,
          bookingId: cmd.bookingId,
          fromStatus: booking.status,
          toStatus: BookingStatus.CANCELLED,
          changedBy: cmd.clientId,
          reason: cmd.reason ?? 'CLIENT_CANCEL',
        },
      });
      if (refundType !== RefundType.NONE) {
        const completedPayment = await tx.payment.findFirst({
          where: { invoice: { bookingId: cmd.bookingId }, status: 'COMPLETED' },
          select: { id: true },
        });
        if (completedPayment) {
          const created = await this.refundHandler.createRefundRequestInTx(
            tx,
            { paymentId: completedPayment.id, reason: `Booking ${cmd.bookingId} cancellation (${refundType})`, performedBy: cmd.clientId },
          );
          paymentId = completedPayment.id;
          refundRequestId = created.refundRequestId;
          idempotencyKey = created.idempotencyKey;
        }
      }
      return cancelled;
    });

    const event = new BookingCancelledEvent({
      organizationId,
      bookingId: booking.id,
      clientId: booking.clientId,
      employeeId: booking.employeeId,
      reason: CancellationReason.CLIENT_REQUESTED,
      cancelNotes: cmd.reason ?? undefined,
      refundType,
      paymentId,
      refundRequestId,
      idempotencyKey,
    });
    await this.eventBus.publish(event.eventName, event.toEnvelope());

    return { status: 'CANCELLED', booking: updated, requiresApproval: false };
  }
}
