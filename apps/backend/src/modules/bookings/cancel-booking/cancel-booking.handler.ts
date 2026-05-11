import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { BookingStatus, RefundType } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database';
import { RlsTransactionService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { EventBusService } from '../../../infrastructure/events';
import { BookingCancelledEvent } from '../events/booking-cancelled.event';
import { GetBookingSettingsHandler } from '../get-booking-settings/get-booking-settings.handler';
import { LaunchFlags } from '../../platform/billing/feature-flags/launch-flags';
import { CancelBookingDto } from './cancel-booking.dto';
import { ZoomMeetingService } from '../zoom-meeting.service';
import { RefundPaymentHandler } from '../../finance/refund-payment/refund-payment.handler';

export type CancelBookingCommand = CancelBookingDto & {
  bookingId: string;
  changedBy: string;
  source?: string;
  clientId?: string;
};

const CANCELLABLE_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  'CANCEL_REQUESTED' as BookingStatus,
];

@Injectable()
export class CancelBookingHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsTx: RlsTransactionService,
    private readonly tenant: TenantContextService,
    private readonly eventBus: EventBusService,
    private readonly settingsHandler: GetBookingSettingsHandler,
    private readonly zoomMeetingService: ZoomMeetingService,
    private readonly flags: LaunchFlags,
    private readonly refundHandler: RefundPaymentHandler,
  ) {}

  async execute(cmd: CancelBookingCommand) {
    const organizationId = this.tenant.requireOrganizationIdOrDefault();
    const booking = await this.prisma.booking.findFirst({
      where: { id: cmd.bookingId },
    });
    if (!booking) {
      throw new NotFoundException(`Booking ${cmd.bookingId} not found`);
    }
    if (cmd.source === 'client' && cmd.clientId && booking.clientId !== cmd.clientId) {
      throw new ForbiddenException('Not your booking');
    }
    if (!CANCELLABLE_STATUSES.includes(booking.status)) {
      throw new BadRequestException(`Booking cannot be cancelled (status: ${booking.status})`);
    }

    const settings = await this.settingsHandler.execute({
      branchId: booking.branchId,
    });

    if (cmd.source === 'client') {
      const requireApproval = 'requireCancelApproval' in settings
        ? (settings as Record<string, unknown>).requireCancelApproval
        : false;
      if (requireApproval) {
        throw new BadRequestException(
          'Cancel approval is required. Use request-cancel-booking instead.',
        );
      }
    }

    const hoursUntilBooking = (booking.scheduledAt.getTime() - Date.now()) / 3_600_000;
    const refundType = hoursUntilBooking >= settings.freeCancelBeforeHours
      ? settings.freeCancelRefundType
      : RefundType.NONE;

    const completedPayment = await this.prisma.payment.findFirst({
      where: { invoice: { bookingId: booking.id }, status: 'COMPLETED' },
      select: { id: true },
    });

    let refundRequestId: string | null = null;
    let idempotencyKey: string | null = null;

    const updated = await this.rlsTx.withTransaction(async (tx) => {
      const cancelledBooking = await tx.booking.update({
        where: { id: cmd.bookingId },
        data: {
          status: BookingStatus.CANCELLED,
          cancelReason: cmd.reason,
          cancelNotes: cmd.cancelNotes,
          cancelledAt: new Date(),
          zoomMeetingStatus: booking.zoomMeetingId ? 'CANCELLED' : undefined,
        },
      });
      await tx.bookingStatusLog.create({
        data: {
          organizationId,
          bookingId: cmd.bookingId,
          fromStatus: booking.status,
          toStatus: BookingStatus.CANCELLED,
          changedBy: cmd.changedBy,
          reason: cmd.reason,
        },
      });
      if (booking.couponCode && this.flags.couponStrictEnabled) {
        await tx.coupon.updateMany({
          where: {
            code: booking.couponCode,
            organizationId,
            usedCount: { gt: 0 },
          },
          data: { usedCount: { decrement: 1 } },
        });
      }
      if (completedPayment && refundType !== RefundType.NONE) {
        const created = await this.refundHandler.createRefundRequestInTx(tx, {
          paymentId: completedPayment.id,
          reason: `Booking ${booking.id} cancellation (${refundType})`,
          performedBy: cmd.changedBy,
        });
        refundRequestId = created.refundRequestId;
        idempotencyKey = created.idempotencyKey;
      }
      return cancelledBooking;
    });

    const event = new BookingCancelledEvent({
      organizationId,
      bookingId: booking.id,
      clientId: booking.clientId,
      employeeId: booking.employeeId,
      reason: cmd.reason,
      cancelNotes: cmd.cancelNotes,
      zoomMeetingId: (booking as Record<string, unknown>).zoomMeetingId as string | null ?? null,
      refundType,
      paymentId: completedPayment?.id ?? null,
      refundRequestId,
      idempotencyKey,
    });
    await this.eventBus.publish(event.eventName, event.toEnvelope());

    if (booking.zoomMeetingId) {
      this.zoomMeetingService.deleteMeeting(organizationId, booking.zoomMeetingId).catch(() => {});
    }

    return { ...updated, refundType };
  }
}
