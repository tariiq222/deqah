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
    const { refundType, paymentId, bookingId, clientId } = envelope.payload;
    if (refundType === 'NONE' || !paymentId) {
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
      // Do not rethrow — manual ops can still issue the refund.
    }
  }
}
