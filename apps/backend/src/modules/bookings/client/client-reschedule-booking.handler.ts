import { Injectable, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database';
import { RlsTransactionService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { GetBookingSettingsHandler } from '../get-booking-settings/get-booking-settings.handler';
import { ClientRescheduleBookingDto } from './client-reschedule-booking.dto';

export type ClientRescheduleCommand = ClientRescheduleBookingDto & {
  bookingId: string;
  clientId: string;
};

@Injectable()
export class ClientRescheduleBookingHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsTx: RlsTransactionService,
    private readonly tenant: TenantContextService,
    private readonly settingsHandler: GetBookingSettingsHandler,
  ) {}

  async execute(cmd: ClientRescheduleCommand) {
    const organizationId = this.tenant.requireOrganizationIdOrDefault();
    const booking = await this.prisma.booking.findUnique({
      where: { id: cmd.bookingId },
    });

    if (!booking) {
      throw new BadRequestException(`Booking ${cmd.bookingId} not found`);
    }

    if (booking.clientId !== cmd.clientId) {
      throw new ForbiddenException('You do not own this booking');
    }

    const reschedulable: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.CONFIRMED];
    if (!reschedulable.includes(booking.status)) {
      throw new BadRequestException(`Booking cannot be rescheduled (status: ${booking.status})`);
    }

    const newScheduledAt = new Date(cmd.newScheduledAt);
    if (newScheduledAt <= new Date()) {
      throw new BadRequestException('New scheduled time must be in the future');
    }

    const settings = await this.settingsHandler.execute({ branchId: booking.branchId });
    const hoursUntilBooking = (booking.scheduledAt.getTime() - Date.now()) / 3_600_000;

    if (hoursUntilBooking < settings.clientRescheduleMinHoursBefore) {
      throw new BadRequestException(
        `Rescheduling is only allowed at least ${settings.clientRescheduleMinHoursBefore} hours before the appointment. Please contact the clinic to reschedule.`,
      );
    }

    const rescheduleCount = await this.prisma.bookingStatusLog.count({
      where: { bookingId: cmd.bookingId, reason: 'CLIENT_RESCHEDULE' },
    });
    if (rescheduleCount >= settings.maxReschedulesPerBooking) {
      throw new BadRequestException(
        `Maximum reschedules (${settings.maxReschedulesPerBooking}) reached for this booking`,
      );
    }

    const durationMins = cmd.newDurationMins ?? booking.durationMins;
    const newEndsAt = new Date(newScheduledAt.getTime() + durationMins * 60_000);

    const [updated] = await this.rlsTx.withTransaction(
      async (tx) => {
        const conflict = await tx.booking.findFirst({
          where: {
            organizationId,
            employeeId: booking.employeeId,
            id: { not: cmd.bookingId },
            status: { in: ['PENDING', 'CONFIRMED'] },
            scheduledAt: { lt: newEndsAt },
            endsAt: { gt: newScheduledAt },
          },
          select: { id: true },
        });
        if (conflict) {
          throw new ConflictException('Employee already has a booking in the new time slot');
        }

        return Promise.all([
          tx.booking.update({
            where: { id: cmd.bookingId },
            data: { scheduledAt: newScheduledAt, endsAt: newEndsAt, durationMins },
          }),
          tx.bookingStatusLog.create({
            data: {
              organizationId,
              bookingId: cmd.bookingId,
              fromStatus: booking.status,
              toStatus: booking.status,
              changedBy: cmd.clientId,
              reason: 'CLIENT_RESCHEDULE',
            },
          }),
        ]);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return { booking: updated };
  }
}
