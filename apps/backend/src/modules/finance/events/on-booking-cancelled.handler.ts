import { Injectable, Logger } from '@nestjs/common';
import { EventBusService, type DomainEventEnvelope } from '../../../infrastructure/events';
import { BookingCancelledPayload } from '../../bookings/events/booking-cancelled.event';
import { RefundPaymentHandler } from '../refund-payment/refund-payment.handler';

/**
 * Subscribes to bookings.booking.cancelled and automatically triggers a refund
 * when a completed payment exists and the cancellation policy grants one.
 */
@Injectable()
export class OnBookingCancelledRefundHandler {
  private readonly logger = new Logger(OnBookingCancelledRefundHandler.name);

  constructor(
    private readonly eventBus: EventBusService,
    private readonly refund: RefundPaymentHandler,
  ) {}

  register(): void {
    this.eventBus.subscribe<BookingCancelledPayload>(
      'bookings.booking.cancelled',
      (envelope: DomainEventEnvelope<BookingCancelledPayload>) => this.handle(envelope),
    );
  }

  async handle(envelope: DomainEventEnvelope<BookingCancelledPayload>): Promise<void> {
    const { refundType, paymentId, bookingId, clientId, refundRequestId, idempotencyKey } = envelope.payload;
    if (refundType === 'NONE' || !paymentId) {
      return;
    }

    if (refundRequestId && idempotencyKey) {
      try {
        await this.refund.finalizeRefundFromCancellation({ refundRequestId, idempotencyKey });
      } catch (err) {
        this.logger.error(
          `Finalize refund from cancellation failed for booking ${bookingId} refundRequest ${refundRequestId}`,
          err,
        );
      }
      return;
    }

    try {
      await this.refund.execute({
        paymentId,
        reason: `Booking ${bookingId} cancellation (${refundType})`,
        performedBy: clientId ?? 'system',
      });
    } catch (err) {
      this.logger.error(
        `Auto-refund failed for booking ${bookingId} payment ${paymentId}`,
        err,
      );
    }
  }
}
