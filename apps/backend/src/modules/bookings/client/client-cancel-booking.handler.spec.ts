import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { ClientCancelBookingHandler } from './client-cancel-booking.handler';
import { mockBooking, buildPrisma, buildTenant, buildRlsTx } from '../testing/booking-test-helpers';

const futureBooking = {
  ...mockBooking,
  scheduledAt: new Date(Date.now() + 48 * 3_600_000),
  endsAt: new Date(Date.now() + 49 * 3_600_000),
};

const buildSettingsHandler = (overrides = {}) => ({
  execute: jest.fn().mockResolvedValue({
    freeCancelBeforeHours: 24,
    freeCancelRefundType: 'FULL',
    ...overrides,
  }),
});

const buildEventBus = () => ({ publish: jest.fn().mockResolvedValue(undefined) });
const buildRefundHandler = () => ({
  createRefundRequestInTx: jest.fn(),
  getRefundRequest: jest.fn(),
  callMoyasarAndFinalize: jest.fn(),
  finalizeRefund: jest.fn(),
});
const refundHandler = buildRefundHandler();

describe('ClientCancelBookingHandler', () => {
  it('cancels a PENDING booking with >24h notice → CANCELLED', async () => {
    const prisma = buildPrisma();
    prisma.booking.findUnique.mockResolvedValue(futureBooking);
    const settings = buildSettingsHandler();
    const handler = new ClientCancelBookingHandler(prisma as never, buildRlsTx(prisma) as never, buildTenant() as never, settings as never, buildEventBus() as never, refundHandler as never);

    const result = await handler.execute({
      bookingId: 'book-1',
      clientId: 'client-1',
      reason: 'Changed my mind',
    });

    expect(result.status).toBe('CANCELLED');
    expect(result.requiresApproval).toBe(false);
    expect(prisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'book-1' },
        data: expect.objectContaining({
          status: BookingStatus.CANCELLED,
          cancelReason: 'CLIENT_REQUESTED',
          cancelledAt: expect.any(Date),
        }),
      }),
    );
    expect(prisma.bookingStatusLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookingId: 'book-1',
        fromStatus: BookingStatus.PENDING,
        toStatus: BookingStatus.CANCELLED,
        changedBy: 'client-1',
        reason: 'Changed my mind',
      }),
    });
  });

  it('outside free cancel window → CANCEL_REQUESTED (requires approval)', async () => {
    const soonBooking = {
      ...mockBooking,
      status: BookingStatus.CONFIRMED,
      scheduledAt: new Date(Date.now() + 12 * 3_600_000),
      endsAt: new Date(Date.now() + 13 * 3_600_000),
    };
    const prisma = buildPrisma();
    prisma.booking.findUnique.mockResolvedValue(soonBooking);
    const settings = buildSettingsHandler({ freeCancelBeforeHours: 24 });
    const handler = new ClientCancelBookingHandler(prisma as never, buildRlsTx(prisma) as never, buildTenant() as never, settings as never, buildEventBus() as never, refundHandler as never);

    const result = await handler.execute({
      bookingId: 'book-1',
      clientId: 'client-1',
    });

    expect(result.status).toBe('CANCEL_REQUESTED');
    expect(result.requiresApproval).toBe(true);
    expect(prisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: BookingStatus.CANCEL_REQUESTED }),
      }),
    );
  });

  it('throws NotFoundException when booking does not exist', async () => {
    const prisma = buildPrisma();
    prisma.booking.findUnique.mockResolvedValue(null);
    const handler = new ClientCancelBookingHandler(prisma as never, buildRlsTx(prisma) as never, buildTenant() as never, buildSettingsHandler() as never, buildEventBus() as never, refundHandler as never);

    await expect(
      handler.execute({ bookingId: 'bad-id', clientId: 'client-1' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when client does not own the booking', async () => {
    const prisma = buildPrisma();
    prisma.booking.findUnique.mockResolvedValue(futureBooking);
    const handler = new ClientCancelBookingHandler(prisma as never, buildRlsTx(prisma) as never, buildTenant() as never, buildSettingsHandler() as never, buildEventBus() as never, refundHandler as never);

    await expect(
      handler.execute({ bookingId: 'book-1', clientId: 'other-client' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws BadRequestException when booking status is not cancellable', async () => {
    const prisma = buildPrisma();
    prisma.booking.findUnique.mockResolvedValue({
      ...futureBooking,
      status: BookingStatus.COMPLETED,
    });
    const handler = new ClientCancelBookingHandler(prisma as never, buildRlsTx(prisma) as never, buildTenant() as never, buildSettingsHandler() as never, buildEventBus() as never, refundHandler as never);

    await expect(
      handler.execute({ bookingId: 'book-1', clientId: 'client-1' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows cancelling AWAITING_PAYMENT booking', async () => {
    const prisma = buildPrisma();
    prisma.booking.findUnique.mockResolvedValue({
      ...futureBooking,
      status: BookingStatus.AWAITING_PAYMENT,
    });
    const handler = new ClientCancelBookingHandler(prisma as never, buildRlsTx(prisma) as never, buildTenant() as never, buildSettingsHandler() as never, buildEventBus() as never, refundHandler as never);

    const result = await handler.execute({ bookingId: 'book-1', clientId: 'client-1' });

    expect(result.status).toBe('CANCELLED');
  });
});