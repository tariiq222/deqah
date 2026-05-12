import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BookingStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { InitClientPaymentHandler } from './init-client-payment.handler';

const organizationId = '00000000-0000-0000-0000-000000000001';
const invoiceId = '00000000-0000-0000-0000-000000000101';
const bookingId = '00000000-0000-0000-0000-000000000201';
const clientId = '00000000-0000-0000-0000-000000000301';

const mockInvoice = {
  id: invoiceId,
  clientId,
  bookingId,
  total: 230,
  currency: 'SAR',
  organizationId,
};

const mockBooking = {
  id: bookingId,
  status: BookingStatus.PENDING,
};

const mockMoyasarPayment = {
  id: 'moyasar-payment-1',
  redirectUrl: 'https://checkout.moyasar.com/pay/moyasar-payment-1',
};

const buildPrisma = () => ({
  invoice: {
    findFirst: jest.fn().mockResolvedValue(mockInvoice),
  },
  booking: {
    findFirst: jest.fn().mockResolvedValue(mockBooking),
  },
  payment: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'payment-1' }),
    update: jest.fn().mockResolvedValue({ id: 'payment-1' }),
    delete: jest.fn().mockResolvedValue({ id: 'payment-1' }),
  },
});

const buildMoyasar = () => ({
  createPayment: jest.fn().mockResolvedValue(mockMoyasarPayment),
});

const buildHandler = () => {
  const prisma = buildPrisma();
  const moyasar = buildMoyasar();
  const tenant = { requireOrganizationId: jest.fn().mockReturnValue(organizationId) } as never;
  const handler = new InitClientPaymentHandler(
    prisma as never,
    moyasar as never,
    tenant,
  );
  return { handler, prisma, moyasar, tenant };
};

describe('InitClientPaymentHandler', () => {
  it('returns redirect data and creates a pending payment row', async () => {
    const { handler, prisma, moyasar } = buildHandler();

    const result = await handler.execute({ invoiceId, clientId, method: 'ONLINE_CARD' });

    expect(result).toEqual({
      paymentId: 'payment-1',
      redirectUrl: 'https://checkout.moyasar.com/pay/moyasar-payment-1',
    });
    expect(prisma.payment.create).toHaveBeenCalledWith({
      data: {
        organizationId,
        invoiceId,
        amount: 230,
        currency: 'SAR',
        method: PaymentMethod.ONLINE_CARD,
        status: PaymentStatus.PENDING,
        idempotencyKey: `client:${invoiceId}`,
      },
      select: { id: true },
    });
    expect(moyasar.createPayment).toHaveBeenCalledWith(organizationId, {
      amountHalalas: 23000,
      currency: 'SAR',
      description: `Invoice payment - ${invoiceId}`,
      callbackUrl: `http://localhost:3000/booking/payment-callback?bookingId=${bookingId}&invoiceId=${invoiceId}`,
      metadata: { invoiceId, bookingId, source: 'mobile-client' },
      idempotencyKey: `payment:${organizationId}:${invoiceId}`,
    });
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: { gatewayRef: 'moyasar-payment-1' },
      select: { id: true },
    });
  });

  it('throws ForbiddenException when the invoice belongs to another client', async () => {
    const { handler, prisma } = buildHandler();
    prisma.invoice.findFirst.mockResolvedValue({ ...mockInvoice, clientId: 'foreign-client' });

    await expect(handler.execute({ invoiceId, clientId })).rejects.toThrow(ForbiddenException);
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the invoice is missing', async () => {
    const { handler, prisma } = buildHandler();
    prisma.invoice.findFirst.mockResolvedValue(null);

    await expect(handler.execute({ invoiceId, clientId })).rejects.toThrow(NotFoundException);
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('returns the same paymentId on an idempotent re-call', async () => {
    const { handler, prisma, moyasar } = buildHandler();
    prisma.payment.findFirst.mockResolvedValue({
      id: 'payment-existing',
      status: PaymentStatus.PENDING,
      gatewayRef: 'moyasar-payment-existing',
    });

    const result = await handler.execute({ invoiceId, clientId });

    expect(result).toEqual({ paymentId: 'payment-existing', redirectUrl: '' });
    expect(prisma.payment.delete).not.toHaveBeenCalled();
    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(moyasar.createPayment).not.toHaveBeenCalled();
  });

  it('deletes the pending row when Moyasar throws so the idempotency key is not claimed', async () => {
    const { handler, prisma, moyasar } = buildHandler();
    const error = new Error('Moyasar unavailable');
    moyasar.createPayment.mockRejectedValue(error);

    await expect(handler.execute({ invoiceId, clientId })).rejects.toThrow(error);

    expect(prisma.payment.create).toHaveBeenCalledWith({
      data: {
        organizationId,
        invoiceId,
        amount: 230,
        currency: 'SAR',
        method: PaymentMethod.ONLINE_CARD,
        status: PaymentStatus.PENDING,
        idempotencyKey: `client:${invoiceId}`,
      },
      select: { id: true },
    });
    expect(prisma.payment.delete).toHaveBeenCalledWith({ where: { id: 'payment-1' } });
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it('deletes an orphan idempotent payment and creates a fresh gateway payment', async () => {
    const { handler, prisma, moyasar } = buildHandler();
    prisma.payment.findFirst.mockResolvedValue({
      id: 'payment-orphan',
      status: PaymentStatus.PENDING,
      gatewayRef: null,
    });

    const result = await handler.execute({ invoiceId, clientId });

    expect(result).toEqual({
      paymentId: 'payment-1',
      redirectUrl: 'https://checkout.moyasar.com/pay/moyasar-payment-1',
    });
    expect(prisma.payment.delete).toHaveBeenCalledWith({ where: { id: 'payment-orphan' } });
    expect(prisma.payment.create).toHaveBeenCalledWith({
      data: {
        organizationId,
        invoiceId,
        amount: 230,
        currency: 'SAR',
        method: PaymentMethod.ONLINE_CARD,
        status: PaymentStatus.PENDING,
        idempotencyKey: `client:${invoiceId}`,
      },
      select: { id: true },
    });
    expect(moyasar.createPayment).toHaveBeenCalledWith(organizationId, {
      amountHalalas: 23000,
      currency: 'SAR',
      description: `Invoice payment - ${invoiceId}`,
      callbackUrl: `http://localhost:3000/booking/payment-callback?bookingId=${bookingId}&invoiceId=${invoiceId}`,
      metadata: { invoiceId, bookingId, source: 'mobile-client' },
      idempotencyKey: `payment:${organizationId}:${invoiceId}`,
    });
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: { gatewayRef: 'moyasar-payment-1' },
      select: { id: true },
    });
  });

  it('throws ConflictException when an idempotent payment is already completed', async () => {
    const { handler, prisma } = buildHandler();
    prisma.payment.findFirst.mockResolvedValue({
      id: 'payment-completed',
      status: PaymentStatus.COMPLETED,
    });

    await expect(handler.execute({ invoiceId, clientId })).rejects.toThrow(ConflictException);
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });
});
