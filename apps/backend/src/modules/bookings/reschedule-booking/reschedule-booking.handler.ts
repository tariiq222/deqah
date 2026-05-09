import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';

/** Re-map a Postgres exclusion violation (23P01) to a domain 409 conflict. */
function mapDbConflict(err: unknown): never {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2010' &&
    (err.meta as Record<string, unknown> | undefined)?.['code'] === '23P01'
  ) {
    throw new ConflictException('Employee already has a booking in the new time slot');
  }
  throw err;
}
import { PrismaService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { GetBookingSettingsHandler } from '../get-booking-settings/get-booking-settings.handler';
import { RescheduleBookingDto } from './reschedule-booking.dto';
import { fetchBookingOrFail } from '../booking-lifecycle.helper';
import { ZoomMeetingService } from '../zoom-meeting.service';

export type RescheduleBookingCommand = Omit<RescheduleBookingDto, 'newScheduledAt'> & {
  bookingId: string;
  newScheduledAt: Date;
  changedBy: string;
};

@Injectable()
export class RescheduleBookingHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly settingsHandler: GetBookingSettingsHandler,
    private readonly zoomMeetingService: ZoomMeetingService,
  ) {}

  async execute(cmd: RescheduleBookingCommand) {
    const organizationId = this.tenant.requireOrganizationIdOrDefault();
    const booking = await fetchBookingOrFail(this.prisma, cmd.bookingId, [BookingStatus.PENDING, BookingStatus.CONFIRMED], 'rescheduled');

    const newScheduledAt = new Date(cmd.newScheduledAt);
    if (newScheduledAt <= new Date()) {
      throw new BadRequestException('New scheduled time must be in the future');
    }

    const settings = await this.settingsHandler.execute({
      branchId: booking.branchId,
    });

    const rescheduleCount = await this.prisma.bookingStatusLog.count({
      where: { bookingId: cmd.bookingId, reason: 'rescheduled' },
    });
    if (rescheduleCount >= settings.maxReschedulesPerBooking) {
      throw new BadRequestException(
        `Maximum reschedules (${settings.maxReschedulesPerBooking}) reached for this booking`,
      );
    }

    const durationMins = cmd.newDurationMins ?? booking.durationMins;
    const newEndsAt = new Date(newScheduledAt.getTime() + durationMins * 60_000);

    // Serialize conflict check + update + status log inside one transaction.
    const [updated] = await this.prisma.$transaction(
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
              changedBy: cmd.changedBy,
              reason: 'rescheduled',
            },
          }),
        ]);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ).catch(mapDbConflict) as [Awaited<ReturnType<typeof this.prisma.booking.update>>, unknown];

    if (booking.zoomMeetingId) {
      // Best effort update
      this.zoomMeetingService
        .updateMeeting(organizationId, booking.zoomMeetingId, {
          topic: `Booking ${booking.id}`,
          startTime: newScheduledAt.toISOString(),
          durationMins,
        })
        .catch(() => {});
    }

    return updated;
  }
}
