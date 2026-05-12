import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { CancelBookingHandler } from '../cancel-booking/cancel-booking.handler';
import type { CancelRecurringSeriesDto } from './cancel-recurring-series.dto';

export type CancelRecurringSeriesCommand = CancelRecurringSeriesDto & {
  changedBy: string;
};

const CANCELLABLE_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  'CANCEL_REQUESTED' as BookingStatus,
];

@Injectable()
export class CancelRecurringSeriesHandler {
  private readonly logger = new Logger(CancelRecurringSeriesHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly cancelBooking: CancelBookingHandler,
  ) {}

  async execute(cmd: CancelRecurringSeriesCommand): Promise<{ cancelled: number; skipped: number }> {
    this.tenant.requireOrganizationIdOrDefault();

    const where: Prisma.BookingWhereInput = {
      recurringGroupId: cmd.recurringGroupId,
      status: { in: CANCELLABLE_STATUSES },
    };

    if (cmd.fromDate) {
      where.scheduledAt = { gte: new Date(cmd.fromDate) };
    }

    const bookings = await this.prisma.booking.findMany({
      where,
      select: { id: true },
      orderBy: { scheduledAt: 'asc' },
    });

    if (bookings.length === 0) {
      throw new NotFoundException(`No cancellable bookings found for recurringGroupId ${cmd.recurringGroupId}`);
    }

    let cancelled = 0;
    let skipped = 0;

    for (const { id } of bookings) {
      try {
        await this.cancelBooking.execute({
          bookingId: id,
          changedBy: cmd.changedBy,
          reason: cmd.reason,
          cancelNotes: cmd.cancelNotes,
        });
        cancelled++;
      } catch (err) {
        this.logger.warn(`Skipped booking ${id} during recurring cancel: ${(err as Error).message}`);
        skipped++;
      }
    }

    return { cancelled, skipped };
  }
}
