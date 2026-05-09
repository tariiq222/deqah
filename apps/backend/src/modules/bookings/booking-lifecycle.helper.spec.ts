import { NotFoundException, BadRequestException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { fetchBookingOrFail } from './booking-lifecycle.helper';
import { buildPrisma, mockBooking } from './testing/booking-test-helpers';

describe('fetchBookingOrFail', () => {
  it('returns booking when found and status allowed', async () => {
    const prisma = buildPrisma();
    prisma.booking.findFirst = jest.fn().mockResolvedValue({ ...mockBooking, status: BookingStatus.PENDING });

    const result = await fetchBookingOrFail(prisma as never, 'book-1', [BookingStatus.PENDING], 'cancelled');

    expect(result).toMatchObject({ id: 'book-1', status: BookingStatus.PENDING });
  });

  it('throws NotFoundException when booking not found', async () => {
    const prisma = buildPrisma();
    prisma.booking.findFirst = jest.fn().mockResolvedValue(null);

    await expect(
      fetchBookingOrFail(prisma as never, 'bad-id', [BookingStatus.PENDING], 'cancelled'),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when status not in allowedStatuses', async () => {
    const prisma = buildPrisma();
    prisma.booking.findFirst = jest.fn().mockResolvedValue({ ...mockBooking, status: BookingStatus.COMPLETED });

    await expect(
      fetchBookingOrFail(prisma as never, 'book-1', [BookingStatus.PENDING], 'cancelled'),
    ).rejects.toThrow(BadRequestException);
  });

  it('error message includes booking status', async () => {
    const prisma = buildPrisma();
    prisma.booking.findFirst = jest.fn().mockResolvedValue({ ...mockBooking, status: BookingStatus.CANCELLED });

    await expect(
      fetchBookingOrFail(prisma as never, 'book-1', [BookingStatus.PENDING], 'confirmed'),
    ).rejects.toThrow(/CANCELLED/);
  });
});
