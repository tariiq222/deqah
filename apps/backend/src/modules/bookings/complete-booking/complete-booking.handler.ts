import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { CompleteBookingDto } from './complete-booking.dto';
import { fetchBookingOrFail } from '../booking-lifecycle.helper';

export type CompleteBookingCommand = CompleteBookingDto & {
  bookingId: string;
  changedBy: string;
};

@Injectable()
export class CompleteBookingHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async execute(cmd: CompleteBookingCommand) {
    const organizationId = this.tenant.requireOrganizationIdOrDefault();
    const booking = await fetchBookingOrFail(this.prisma, cmd.bookingId, [BookingStatus.CONFIRMED], 'completed');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({
        where: { id: cmd.bookingId, organizationId },
        data: {
          status: BookingStatus.COMPLETED,
          completedAt: new Date(),
          ...(cmd.completionNotes && { notes: cmd.completionNotes }),
        },
      });

      await tx.bookingStatusLog.create({
        data: {
          organizationId,
          bookingId: cmd.bookingId,
          fromStatus: booking.status,
          toStatus: BookingStatus.COMPLETED,
          changedBy: cmd.changedBy,
        },
      });

      // payAtClinic bookings have no invoice yet (create-booking.handler.ts skips it
      // for payAtClinic). Create one now at completion time so the financial trail
      // is complete. We use findUnique on bookingId to silently no-op if an invoice
      // somehow already exists.
      if (booking.payAtClinic) {
        const existing = await tx.invoice.findUnique({ where: { bookingId: booking.id } });
        if (!existing) {
          const orgSettings = await tx.organizationSettings.findFirst({
            where: { organizationId },
            select: { vatRate: true },
          });
          const vatRate = orgSettings?.vatRate ? Number(orgSettings.vatRate) : 0.15;
          const subtotal = Number(booking.discountedPrice ?? booking.price);
          const vatAmt = Number((subtotal * vatRate).toFixed(2));
          const total = Number((subtotal + vatAmt).toFixed(2));
          await tx.invoice.create({
            data: {
              organizationId,
              branchId: booking.branchId,
              clientId: booking.clientId,
              employeeId: booking.employeeId,
              bookingId: booking.id,
              subtotal,
              vatRate,
              vatAmt,
              total,
              currency: booking.currency,
              status: 'ISSUED',
              issuedAt: new Date(),
            },
          });
        }
      }

      return updated;
    });
  }
}
