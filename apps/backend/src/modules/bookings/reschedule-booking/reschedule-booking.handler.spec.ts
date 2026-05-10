import { BadRequestException, ConflictException } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { RescheduleBookingHandler } from './reschedule-booking.handler';
import { buildPrisma, buildTenant, buildRlsTx, mockBooking } from '../testing/booking-test-helpers';

const defaultRescheduleSettings = {
  execute: jest.fn().mockResolvedValue({ maxReschedulesPerBooking: 3 }),
};

describe('RescheduleBookingHandler', () => {
  const newFuture = new Date(Date.now() + 172800_000);

  it('reschedules booking when new slot is free', async () => {
    const prisma = buildPrisma();
    await new RescheduleBookingHandler(prisma as never, buildRlsTx(prisma) as never, buildTenant() as never, defaultRescheduleSettings as never, { updateMeeting: jest.fn().mockResolvedValue(undefined) } as never).execute({
      bookingId: 'book-1', newScheduledAt: newFuture, changedBy: 'user-42',
    });
    expect(prisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ scheduledAt: newFuture }) }),
    );
  });

  it('throws BadRequestException when booking is COMPLETED', async () => {
    const prisma = buildPrisma();
    prisma.booking.findUnique = jest.fn().mockResolvedValue({ ...mockBooking, status: BookingStatus.COMPLETED });
    await expect(
      new RescheduleBookingHandler(prisma as never, buildRlsTx(prisma) as never, buildTenant() as never, defaultRescheduleSettings as never, { updateMeeting: jest.fn().mockResolvedValue(undefined) } as never).execute({
        bookingId: 'book-1', newScheduledAt: newFuture, changedBy: 'user-42',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('RescheduleBookingHandler — DB exclusion constraint error mapping', () => {
  it('maps Postgres 23P01 exclusion violation to ConflictException on reschedule', async () => {
    const exclusionError = new Prisma.PrismaClientKnownRequestError(
      'exclusion constraint violation',
      { code: 'P2010', clientVersion: '5.0.0', meta: { code: '23P01' } },
    );
    const prisma = buildPrisma();
    // Handler uses rlsTx.withTransaction — mock it to throw the exclusion error directly
    const rlsTx = {
      withTransaction: jest.fn().mockRejectedValueOnce(exclusionError),
      withBypassTransaction: jest.fn(),
    } as unknown as import('../../../infrastructure/database').RlsTransactionService;

    await expect(
      new RescheduleBookingHandler(
        prisma as never,
        rlsTx as never,
        buildTenant() as never,
        defaultRescheduleSettings as never,
        { updateMeeting: jest.fn().mockResolvedValue(undefined) } as never,
      ).execute({
        bookingId: 'book-1',
        newScheduledAt: new Date(Date.now() + 86_400_000),
        changedBy: 'user-1',
      }),
    ).rejects.toThrow(ConflictException);
  });
});

describe('RescheduleBookingHandler — maxReschedulesPerBooking', () => {
  it('allows reschedule when count is below max', async () => {
    const prisma = buildPrisma();
    (prisma as any).bookingStatusLog.count = jest.fn().mockResolvedValue(2);
    const settingsHandler = { execute: jest.fn().mockResolvedValue({ maxReschedulesPerBooking: 3 }) };
    const handler = new RescheduleBookingHandler(prisma as never, buildRlsTx(prisma) as never, buildTenant() as never, settingsHandler as never, { updateMeeting: jest.fn().mockResolvedValue(undefined) } as never);
    const newTime = new Date(Date.now() + 2 * 86400_000);

    await expect(
      handler.execute({ bookingId: 'book-1', newScheduledAt: newTime, changedBy: 'user-42' }),
    ).resolves.toBeDefined();
  });

  it('throws BadRequestException when max reschedules reached', async () => {
    const prisma = buildPrisma();
    (prisma as any).bookingStatusLog.count = jest.fn().mockResolvedValue(3);
    const settingsHandler = { execute: jest.fn().mockResolvedValue({ maxReschedulesPerBooking: 3 }) };
    const handler = new RescheduleBookingHandler(prisma as never, buildRlsTx(prisma) as never, buildTenant() as never, settingsHandler as never, { updateMeeting: jest.fn().mockResolvedValue(undefined) } as never);
    const newTime = new Date(Date.now() + 2 * 86400_000);

    await expect(
      handler.execute({ bookingId: 'book-1', newScheduledAt: newTime, changedBy: 'user-42' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('writes rescheduled log entry on success', async () => {
    const prisma = buildPrisma();
    (prisma as any).bookingStatusLog.count = jest.fn().mockResolvedValue(0);
    const settingsHandler = { execute: jest.fn().mockResolvedValue({ maxReschedulesPerBooking: 3 }) };
    const handler = new RescheduleBookingHandler(prisma as never, buildRlsTx(prisma) as never, buildTenant() as never, settingsHandler as never, { updateMeeting: jest.fn().mockResolvedValue(undefined) } as never);
    const newTime = new Date(Date.now() + 2 * 86400_000);

    await handler.execute({ bookingId: 'book-1', newScheduledAt: newTime, changedBy: 'user-42' });

    expect(prisma.bookingStatusLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reason: 'rescheduled', changedBy: 'user-42' }),
    });
  });
});
