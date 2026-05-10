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
import { GetBookingSettingsHandler } from '../get-booking-settings/get-booking-settings.handler';
import { BookingCancelApprovedEvent } from '../events/booking-cancel-approved.event';

export interface ApproveCancelBookingCommand {
  bookingId: string;
  approvedBy: string;
  approverNotes?: string;
}

@Injectable()
export class ApproveCancelBookingHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsTx: RlsTransactionService,
    private readonly tenant: TenantContextService,
    private readonly eventBus: EventBusService,
    private readonly settingsHandler: GetBookingSettingsHandler,
  ) {}

  async execute(cmd: ApproveCancelBookingCommand) {
    const organizationId = this.tenant.requireOrganizationIdOrDefault();
    const booking = await this.prisma.booking.findFirst({
      where: { id: cmd.bookingId },
    });
    if (!booking) {
      throw new NotFoundException(`Booking ${cmd.bookingId} not found`);
    }
    if (booking.status !== ('CANCEL_REQUESTED' as BookingStatus)) {
      throw new BadRequestException(
        `Only CANCEL_REQUESTED bookings can be approved (status: ${booking.status})`,
      );
    }

    const settings = await this.settingsHandler.execute({
      branchId: booking.branchId,
    });

    const autoRefund =
      'autoRefundOnCancel' in settings
        ? (settings as Record<string, unknown>).autoRefundOnCancel === true
        : true;

    const [updated] = await this.rlsTx.withTransaction((tx) => Promise.all([
      tx.booking.update({
        where: { id: cmd.bookingId },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      }),
      tx.bookingStatusLog.create({
        data: {
          organizationId,
          bookingId: cmd.bookingId,
          fromStatus: 'CANCEL_REQUESTED' as BookingStatus,
          toStatus: BookingStatus.CANCELLED,
          changedBy: cmd.approvedBy,
          reason: cmd.approverNotes ?? 'Cancel request approved',
        },
      }),
    ]));

    const event = new BookingCancelApprovedEvent({
      bookingId: booking.id,
      clientId: booking.clientId,
      employeeId: booking.employeeId,
      autoRefund,
      approverNotes: cmd.approverNotes,
    });
    await this.eventBus.publish(event.eventName, event.toEnvelope());

    return { ...updated, autoRefund };
  }
}
