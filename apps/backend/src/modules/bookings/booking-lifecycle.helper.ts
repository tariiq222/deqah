import { NotFoundException, BadRequestException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database';

export async function fetchBookingOrFail(
  prisma: PrismaService,
  bookingId: string,
  allowedStatuses: BookingStatus[],
  actionLabel: string,
) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId },
  });
  if (!booking) {
    throw new NotFoundException(`Booking ${bookingId} not found`);
  }
  if (!allowedStatuses.includes(booking.status)) {
    throw new BadRequestException(
      `Booking cannot be ${actionLabel} (status: ${booking.status})`,
    );
  }
  return booking;
}
