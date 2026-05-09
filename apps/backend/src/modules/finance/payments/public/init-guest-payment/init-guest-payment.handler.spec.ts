import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InitGuestPaymentHandler } from './init-guest-payment.handler';

const mockBooking = {
  id: 'booking-1',
  status: 'AWAITING_PAYMENT',
  price: 100,
  currency: 'SAR',
};

const mockInvoice = {
  id: 'inv-1',
  total: 115,
  currency: 'SAR',
};

const mockPayment = {
  id: 'pay-1',
  invoiceId: 'inv-1',
  amount: 115,
  currency: 'SAR',
  status: 'PENDING',
  idempotencyKey: 'guest:booking-1',
};

const mockMoyasarPayment = {
  id: 'moyasar-pay-1',
  amount: 11500,
  currency: 'SAR',
  status: 'initiated' as const,
  description: 'Booking payment - booking-1',
  metadata: { invoiceId: 'inv-1', bookingId: 'booking-1' },
  redirectUrl: 'https://checkout.moyasar.com/pay/pay_xxx',
  createdAt: '2026-04-17T12:00:00Z',
  updatedAt: '2026-04-17T12:00:00Z',
};

const buildMoyasar = () => ({
  createPayment: jest.fn().mockResolvedValue(mockMoyasarPayment),
  toPaymentStatus: jest.fn().mockReturnValue('PENDING'),
  toPaymentMethod: jest.fn().mockReturnValue('ONLINE_CARD'),
});

interface MockPrisma {
  booking: { findFirst: jest.Mock };
  invoice: { findFirst: jest.Mock };
  payment: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
}

function buildPrisma(): MockPrisma {
  return {
    booking: { findFirst: jest.fn().mockResolvedValue({ ...mockBooking }) },
    invoice: { findFirst: jest.fn().mockResolvedValue({ ...mockInvoice }) },
    payment: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ ...mockPayment }),
      update: jest.fn().mockResolvedValue({ ...mockPayment, gatewayRef: 'moyasar-pay-1' }),
    },
  };
}

const buildTenant = () => ({
  requireOrganizationIdOrDefault: jest.fn().mockReturnValue('00000000-0000-0000-0000-000000000001'),
});

const OLD_ENV = process.env;

describe('InitGuestPaymentHandler', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, PUBLIC_WEBSITE_URL: 'https://clinic.example.com' };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe('execute', () => {
    it('creates a PENDING payment and returns redirect URL from Moyasar', async () => {
      const prisma = buildPrisma();
      const moyasar = buildMoyasar();
      const handler = new InitGuestPaymentHandler(prisma as never, buildTenant() as never, moyasar as never);

      const result = await handler.execute({ bookingId: 'booking-1' });

      expect(prisma.booking.findFirst).toHaveBeenCalledWith({
        where: { id: 'booking-1' },
        select: { id: true, status: true, price: true, currency: true },
      });
      expect(prisma.invoice.findFirst).toHaveBeenCalledWith({
        where: { bookingId: 'booking-1' },
        select: { id: true, total: true, currency: true },
      });
      expect(prisma.payment.findFirst).toHaveBeenCalledWith({
        where: { idempotencyKey: 'guest:booking-1' },
      });
      expect(prisma.payment.create).toHaveBeenCalledWith({
        data: {
          organizationId: '00000000-0000-0000-0000-000000000001',
          invoiceId: 'inv-1',
          amount: mockInvoice.total,
          currency: 'SAR',
          method: 'ONLINE_CARD',
          status: 'PENDING',
          idempotencyKey: 'guest:booking-1',
        },
      });
      expect(moyasar.createPayment).toHaveBeenCalledWith(
        '00000000-0000-0000-0000-000000000001',
        {
          amountHalalas: 11500,
          currency: 'SAR',
          description: 'Booking payment - booking-1',
          callbackUrl: 'https://clinic.example.com/booking/payment-callback?bookingId=booking-1',
          metadata: { invoiceId: 'inv-1', bookingId: 'booking-1' },
        },
      );
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: { gatewayRef: 'moyasar-pay-1' },
      });
      expect(result).toEqual({
        paymentId: 'pay-1',
        redirectUrl: 'https://checkout.moyasar.com/pay/pay_xxx',
      });
    });

    it('throws NotFoundException when booking does not exist', async () => {
      const prisma = buildPrisma();
      prisma.booking.findFirst = jest.fn().mockResolvedValue(null);
      const moyasar = buildMoyasar();
      const handler = new InitGuestPaymentHandler(prisma as never, buildTenant() as never, moyasar as never);

      await expect(handler.execute({ bookingId: 'nonexistent' })).rejects.toThrow(NotFoundException);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when booking is not AWAITING_PAYMENT', async () => {
      const prisma = buildPrisma();
      prisma.booking.findFirst = jest.fn().mockResolvedValue({ ...mockBooking, status: 'CONFIRMED' });
      const moyasar = buildMoyasar();
      const handler = new InitGuestPaymentHandler(prisma as never, buildTenant() as never, moyasar as never);

      await expect(handler.execute({ bookingId: 'booking-1' })).rejects.toThrow(BadRequestException);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when invoice does not exist', async () => {
      const prisma = buildPrisma();
      prisma.invoice.findFirst = jest.fn().mockResolvedValue(null);
      const moyasar = buildMoyasar();
      const handler = new InitGuestPaymentHandler(prisma as never, buildTenant() as never, moyasar as never);

      await expect(handler.execute({ bookingId: 'booking-1' })).rejects.toThrow(NotFoundException);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when existing payment is COMPLETED', async () => {
      const prisma = buildPrisma();
      prisma.payment.findFirst = jest.fn().mockResolvedValue({ ...mockPayment, status: 'COMPLETED' });
      const moyasar = buildMoyasar();
      const handler = new InitGuestPaymentHandler(prisma as never, buildTenant() as never, moyasar as never);

      await expect(handler.execute({ bookingId: 'booking-1' })).rejects.toThrow(ConflictException);
      expect(moyasar.createPayment).not.toHaveBeenCalled();
    });

    it('returns existing pending payment without creating new one (idempotency)', async () => {
      const prisma = buildPrisma();
      prisma.payment.findFirst = jest.fn().mockResolvedValue({ ...mockPayment });
      const moyasar = buildMoyasar();
      const handler = new InitGuestPaymentHandler(prisma as never, buildTenant() as never, moyasar as never);

      const result = await handler.execute({ bookingId: 'booking-1' });

      expect(result).toEqual({ paymentId: 'pay-1', redirectUrl: '' });
      expect(prisma.payment.create).not.toHaveBeenCalled();
      expect(moyasar.createPayment).not.toHaveBeenCalled();
    });

    it('uses default callback URL when PUBLIC_WEBSITE_URL is not set', async () => {
      process.env.PUBLIC_WEBSITE_URL = '';
      const prisma = buildPrisma();
      const moyasar = buildMoyasar();
      const handler = new InitGuestPaymentHandler(prisma as never, buildTenant() as never, moyasar as never);

      await handler.execute({ bookingId: 'booking-1' });

      expect(moyasar.createPayment).toHaveBeenCalledWith(
        '00000000-0000-0000-0000-000000000001',
        expect.objectContaining({
          callbackUrl: 'http://localhost:3000/booking/payment-callback?bookingId=booking-1',
        }),
      );
    });
  });
});