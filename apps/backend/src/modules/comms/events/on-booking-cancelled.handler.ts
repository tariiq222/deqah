import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { NotificationType, RecipientType } from '@prisma/client';
import { EventBusService, type DomainEventEnvelope } from '../../../infrastructure/events';
import { SendNotificationHandler } from '../send-notification/send-notification.handler';
import { GetClientPushTargetsHandler } from '../fcm-tokens/get-client-push-targets.handler';

interface BookingCancelledPayload {
  bookingId: string;
  clientId: string;
  employeeId: string;
  reason: string;
  cancelNotes?: string;
  clientEmail?: string;
  clientName?: string;
  clientPhone?: string;
}

@Injectable()
export class OnBookingCancelledHandler {
  private readonly logger = new Logger(OnBookingCancelledHandler.name);

  constructor(
    private readonly notify: SendNotificationHandler,
    private readonly pushTargets: GetClientPushTargetsHandler,
  ) {}

  register(eventBus: EventBusService): void {
    eventBus.subscribe<BookingCancelledPayload>('bookings.booking.cancelled', (e) => this.handle(e));
  }

  async handle(envelope: DomainEventEnvelope<BookingCancelledPayload>): Promise<void> {
    const { payload } = envelope;
    try {
      const { pushEnabled, tokens } = await this.pushTargets.execute({ clientId: payload.clientId });
      const channels: Array<'in-app' | 'push' | 'email' | 'sms'> = ['in-app', 'email'];
      if (pushEnabled && tokens.length > 0) channels.push('push');
      await this.notify.execute({
        recipientId: payload.clientId,
        recipientType: RecipientType.CLIENT,
        type: NotificationType.BOOKING_CANCELLED,
        title: 'تم إلغاء الحجز',
        body: 'نأسف، تم إلغاء حجزك.',
        channels,
        fcmTokens: tokens,
        recipientEmail: payload.clientEmail,
        emailTemplateSlug: 'booking-cancelled',
        emailVars: {
          client_name: payload.clientName ?? '',
          booking_id: payload.bookingId,
          reason: payload.reason,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to handle bookings.booking.cancelled for booking ${payload.bookingId}`,
        err,
      );
      Sentry.captureException(err, { tags: { event: 'bookings.booking.cancelled', bookingId: payload.bookingId } });
    }
  }
}
