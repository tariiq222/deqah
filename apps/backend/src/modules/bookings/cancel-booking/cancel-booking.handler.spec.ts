import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BookingStatus, CancellationReason } from '@prisma/client';
import { CancelBookingHandler } from './cancel-booking.handler';
import { buildPrisma, buildEventBus, buildTenant, buildRlsTx, mockBooking } from '../testing/booking-test-helpers';

const defaultCancelSettings = {
  execute: jest.fn().mockResolvedValue({
    freeCancelBeforeHours: 24,
    freeCancelRefundType: 'FULL',
    lateCancelRefundPercent: 0,
  }),
};
const flagsOn = { couponStrictEnabled: true };
const flagsOff = { couponStrictEnabled: false };

const buildRefundHandler = () => ({
  createRefundRequestInTx: jest.fn(),
  getRefundRequest: jest.fn(),
  callMoyasarAndFinalize: jest.fn(),
  finalizeRefund: jest.fn(),
});
const refundHandler = buildRefundHandler();
const buildZoom = () => ({ deleteMeeting: jest.fn().mockResolvedValue(undefined) });

describe('CancelBookingHandler', () => {
  it('cancels PENDING booking and emits event', async () => {
    const prisma = buildPrisma();
    const eb = buildEventBus();
    const result = await new CancelBookingHandler(prisma as never, buildRlsTx(prisma) as never, buildTenant() as never, eb as never, defaultCancelSettings as never, buildZoom() as never, flagsOff as never, refundHandler as never).execute({
      bookingId: 'book-1', reason: CancellationReason.CLIENT_REQUESTED, changedBy: 'user-42',
    });
    expect(prisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: BookingStatus.CANCELLED }) }),
    );
    expect(eb.publish).toHaveBeenCalledWith('bookings.booking.cancelled', expect.anything());
    expect(result.status).toBe(BookingStatus.CONFIRMED);
  });

  it('throws NotFoundException when booking not found', async () => {
    const prisma = buildPrisma();
    prisma.booking.findUnique = jest.fn().mockResolvedValue(null);
    await expect(
      new CancelBookingHandler(prisma as never, buildRlsTx(prisma) as never, buildTenant() as never, buildEventBus() as never, defaultCancelSettings as never, buildZoom() as never, flagsOff as never, refundHandler as never).execute({
        bookingId: 'bad', reason: CancellationReason.OTHER, changedBy: 'user-42',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when booking is already CANCELLED', async () => {
    const prisma = buildPrisma();
    prisma.booking.findUnique = jest.fn().mockResolvedValue({ ...mockBooking, status: BookingStatus.CANCELLED });
    await expect(
      new CancelBookingHandler(prisma as never, buildRlsTx(prisma) as never, buildTenant() as never, buildEventBus() as never, defaultCancelSettings as never, buildZoom() as never, flagsOff as never, refundHandler as never).execute({
        bookingId: 'book-1', reason: CancellationReason.OTHER, changedBy: 'user-42',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('CancelBookingHandler — status log', () => {
  it('writes a BookingStatusLog entry on cancel', async () => {
    const prisma = buildPrisma();
    const eventBus = { publish: jest.fn() };
    const handler = new CancelBookingHandler(prisma as never, buildRlsTx(prisma) as never, buildTenant() as never, eventBus as never, defaultCancelSettings as never, buildZoom() as never, flagsOff as never, refundHandler as never);

    await handler.execute({
      bookingId: 'book-1',
      reason: CancellationReason.CLIENT_REQUESTED,
      changedBy: 'user-42',
    });

    expect(prisma.bookingStatusLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fromStatus: BookingStatus.PENDING,
        toStatus: BookingStatus.CANCELLED,
        changedBy: 'user-42',
      }),
    });
  });
});

describe('CancelBookingHandler — free cancel window', () => {
  it('attaches freeCancelRefundType when cancelling within free window', async () => {
    const prisma = buildPrisma();
    const eventBus = { publish: jest.fn() };
    const in48h = new Date(Date.now() + 48 * 3_600_000);
    prisma.booking.findUnique.mockResolvedValue({ ...mockBooking, scheduledAt: in48h });
    const settingsHandler = {
      execute: jest.fn().mockResolvedValue({
        freeCancelBeforeHours: 24,
        freeCancelRefundType: 'FULL',
        lateCancelRefundPercent: 0,
      }),
    };
    const handler = new CancelBookingHandler(prisma as never, buildRlsTx(prisma) as never, buildTenant() as never, eventBus as never, settingsHandler as never, buildZoom() as never, flagsOff as never, refundHandler as never);

    const result = await handler.execute({
      bookingId: 'book-1',
      reason: CancellationReason.CLIENT_REQUESTED, changedBy: 'user-42',
    });

    expect(result.refundType).toBe('FULL');
  });

  it('attaches NONE when cancelling outside free window', async () => {
    const prisma = buildPrisma();
    const eventBus = { publish: jest.fn() };
    const in10h = new Date(Date.now() + 10 * 3_600_000);
    prisma.booking.findUnique.mockResolvedValue({ ...mockBooking, scheduledAt: in10h });
    const settingsHandler = {
      execute: jest.fn().mockResolvedValue({
        freeCancelBeforeHours: 24,
        freeCancelRefundType: 'FULL',
        lateCancelRefundPercent: 0,
      }),
    };
    const handler = new CancelBookingHandler(prisma as never, buildRlsTx(prisma) as never, buildTenant() as never, eventBus as never, settingsHandler as never, buildZoom() as never, flagsOff as never, refundHandler as never);

    const result = await handler.execute({
      bookingId: 'book-1',
      reason: CancellationReason.CLIENT_REQUESTED, changedBy: 'user-42',
    });

    expect(result.refundType).toBe('NONE');
  });
});

describe('CancelBookingHandler — coupon release on cancel', () => {
  it('decrements coupon.usedCount when booking had a coupon and flag on', async () => {
    const prisma = buildPrisma();
    const couponUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    (prisma as Record<string, unknown>).coupon = { updateMany: couponUpdateMany };
    prisma.booking.findUnique.mockResolvedValue({ ...mockBooking, couponCode: 'PROMO10' });

    const handler = new CancelBookingHandler(
      prisma as never,
      buildRlsTx(prisma) as never,
      buildTenant() as never,
      buildEventBus() as never,
      defaultCancelSettings as never,
      buildZoom() as never,
      flagsOn as never,
      refundHandler as never,
    );

    await handler.execute({ bookingId: 'book-1', reason: CancellationReason.CLIENT_REQUESTED, changedBy: 'user-1' });

    expect(couponUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ code: 'PROMO10', usedCount: { gt: 0 } }),
        data: { usedCount: { decrement: 1 } },
      }),
    );
  });

  it('does not decrement when booking had no coupon', async () => {
    const prisma = buildPrisma();
    const couponUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    (prisma as Record<string, unknown>).coupon = { updateMany: couponUpdateMany };
    prisma.booking.findUnique.mockResolvedValue({ ...mockBooking, couponCode: null });

    const handler = new CancelBookingHandler(
      prisma as never,
      buildRlsTx(prisma) as never,
      buildTenant() as never,
      buildEventBus() as never,
      defaultCancelSettings as never,
      buildZoom() as never,
      flagsOn as never,
      refundHandler as never,
    );

    await handler.execute({ bookingId: 'book-1', reason: CancellationReason.CLIENT_REQUESTED, changedBy: 'user-1' });

    expect(couponUpdateMany).not.toHaveBeenCalled();
  });

  it('does not decrement when flag off', async () => {
    const prisma = buildPrisma();
    const couponUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    (prisma as Record<string, unknown>).coupon = { updateMany: couponUpdateMany };
    prisma.booking.findUnique.mockResolvedValue({ ...mockBooking, couponCode: 'PROMO10' });

    const handler = new CancelBookingHandler(
      prisma as never,
      buildRlsTx(prisma) as never,
      buildTenant() as never,
      buildEventBus() as never,
      defaultCancelSettings as never,
      buildZoom() as never,
      flagsOff as never,
      refundHandler as never,
    );

    await handler.execute({ bookingId: 'book-1', reason: CancellationReason.CLIENT_REQUESTED, changedBy: 'user-1' });

    expect(couponUpdateMany).not.toHaveBeenCalled();
  });

  it('coupon usedCount decrement AND RefundRequest creation are in the same transaction', async () => {
    const prisma = buildPrisma();
    const couponUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    (prisma as Record<string, unknown>).coupon = { updateMany: couponUpdateMany };
    prisma.payment.findFirst.mockResolvedValue({ id: 'pay_1' });

    const refundResponse = {
      refundRequestId: 'rr_test',
      idempotencyKey: 'refund:pay_1:100.00',
      payment: {
        id: 'pay_1',
        gatewayRef: 'gw_1',
        amount: 100,
        invoice: { id: 'inv_1', bookingId: 'book-1', clientId: 'cli_1', currency: 'SAR', organizationId: 'org_1' },
      },
    };
    refundHandler.createRefundRequestInTx = jest.fn().mockResolvedValue(refundResponse);

    const in48h = new Date(Date.now() + 48 * 3_600_000);
    prisma.booking.findUnique.mockResolvedValue({ ...mockBooking, couponCode: 'PROMO10', scheduledAt: in48h });

    const handler = new CancelBookingHandler(
      prisma as never,
      buildRlsTx(prisma) as never,
      buildTenant() as never,
      buildEventBus() as never,
      defaultCancelSettings as never,
      buildZoom() as never,
      flagsOn as never,
      refundHandler as never,
    );

    await handler.execute({ bookingId: 'book-1', reason: CancellationReason.CLIENT_REQUESTED, changedBy: 'user-1' });

    expect(couponUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ code: 'PROMO10', usedCount: { gt: 0 } }),
        data: { usedCount: { decrement: 1 } },
      }),
    );
    expect(refundHandler.createRefundRequestInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        paymentId: 'pay_1',
        reason: expect.stringContaining('book-1'),
      }),
    );
  });
});