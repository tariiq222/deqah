import { NotFoundException, BadRequestException } from '@nestjs/common';
import { InvoiceStatus, PaymentStatus } from '@prisma/client';
import { RefundPaymentHandler } from './refund-payment/refund-payment.handler';
import { VerifyPaymentHandler } from './verify-payment/verify-payment.handler';
import { RlsTransactionService } from '../../infrastructure/database';

const buildPaymentRow = (overrides: Partial<{
  id: string;
  status: string;
  gatewayRef: string | null;
  amount: unknown;
  invoiceId: string;
}> = {}) => ({
  id: 'pay-1',
  status: 'COMPLETED',
  gatewayRef: 'pay_test_gw_123',
  amount: 100,
  invoiceId: 'inv-1',
  ...overrides,
});

const buildPrisma = () => {
  const prisma: {
    payment: {
      findFirst: jest.Mock;
      update: jest.Mock;
      aggregate: jest.Mock;
    };
    invoice: {
      findFirst: jest.Mock;
      update: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    refundRequest: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  } = {
    payment: {
      findFirst: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    invoice: {
      findFirst: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'inv-1', bookingId: 'book-1', clientId: 'client-1', currency: 'SAR', organizationId: 'org-1', total: '100', vatAmt: '15', refundedAmount: '0' }),
    },
    refundRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'rr-1' }),
      update: jest.fn().mockResolvedValue({ id: 'rr-1' }),
    },
    $transaction: jest.fn(async (fn) => fn(prisma)),
    $queryRaw: jest.fn().mockResolvedValue([buildPaymentRow()]),
  };
  return prisma;
};

const buildEventBus = () => ({
  publish: jest.fn().mockResolvedValue(undefined),
  subscribe: jest.fn(),
});
const buildRlsTx = (prisma: ReturnType<typeof buildPrisma>) =>
  ({
    withTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  } as unknown as RlsTransactionService);
const buildMoyasar = () => ({
  createRefund: jest.fn().mockResolvedValue({ id: 'refund-gw-1' }),
});

const PAY_ID = 'pay-1';

describe('RefundPaymentHandler', () => {
  const PAYMENT_BASE = {
    id: PAY_ID,
    amount: 100,
    gatewayRef: 'pay_test_gw_123',
    invoice: {
      id: 'inv-1',
      bookingId: 'book-1',
      clientId: 'client-1',
      currency: 'SAR',
      organizationId: 'org-1',
    },
  };

  it('refunds a completed payment + creates RefundRequest + emits RefundCompletedEvent', async () => {
    const prisma = buildPrisma();
    const eventBus = buildEventBus();
    const moyasar = buildMoyasar();
    const refunded = { id: PAY_ID, status: PaymentStatus.REFUNDED, failureReason: 'client request' };
    prisma.payment.update.mockResolvedValue(refunded);
    prisma.invoice.update.mockResolvedValue({ id: 'inv-1' });

    const handler = new RefundPaymentHandler(prisma as never, eventBus as never, buildRlsTx(prisma), moyasar as never);
    const result = await handler.execute({ paymentId: PAY_ID, reason: 'client request' });

    expect(result.status).toBe(PaymentStatus.REFUNDED);
    expect(prisma.refundRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentId: PAY_ID,
          status: 'PROCESSING',
        }),
      }),
    );
    expect(prisma.refundRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED', gatewayRef: 'refund-gw-1' }),
      }),
    );
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PAY_ID },
        data: expect.objectContaining({ status: PaymentStatus.REFUNDED, failureReason: 'client request' }),
      }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      'finance.refund.completed',
      expect.objectContaining({
        payload: expect.objectContaining({
          paymentId: PAY_ID,
          bookingId: 'book-1',
          organizationId: 'org-1',
        }),
      }),
    );
  });

  it('throws NotFoundException when payment not found', async () => {
    const prisma = buildPrisma();
    const eventBus = buildEventBus();
    prisma.$queryRaw.mockResolvedValueOnce([]);

    await expect(
      new RefundPaymentHandler(prisma as never, eventBus as never, buildRlsTx(prisma), buildMoyasar() as never).execute({ paymentId: 'bad', reason: 'x' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when payment is not COMPLETED', async () => {
    const prisma = buildPrisma();
    const eventBus = buildEventBus();
    prisma.$queryRaw.mockResolvedValueOnce([{ ...buildPaymentRow(), status: PaymentStatus.PENDING }]);

    await expect(
      new RefundPaymentHandler(prisma as never, eventBus as never, buildRlsTx(prisma), buildMoyasar() as never).execute({ paymentId: PAY_ID, reason: 'x' }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('VerifyPaymentHandler', () => {
  const INVOICE_ID = 'inv-1';

  it('approves (sets COMPLETED), flips invoice to PAID, and publishes PaymentCompletedEvent', async () => {
    const prisma = buildPrisma();
    const eventBus = buildEventBus();
    const pendingPayment = {
      id: PAY_ID,
      invoiceId: INVOICE_ID,
      amount: 230,
      status: PaymentStatus.PENDING_VERIFICATION,
      gatewayRef: null,
    };
    const verified = {
      ...pendingPayment,
      status: PaymentStatus.COMPLETED,
      processedAt: new Date(),
      gatewayRef: 'REF-123',
    };
    prisma.payment.findFirst.mockResolvedValue(pendingPayment);
    prisma.payment.update.mockResolvedValue(verified);
    prisma.invoice.findFirst.mockResolvedValue({
      id: INVOICE_ID,
      total: 230,
      currency: 'SAR',
      bookingId: 'book-1',
    });
    prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 230 } });
    prisma.invoice.update.mockResolvedValue({ id: INVOICE_ID, status: InvoiceStatus.PAID });

    const handler = new VerifyPaymentHandler(prisma as never, eventBus as never, buildRlsTx(prisma));
    const result = await handler.execute({
      paymentId: PAY_ID,
      action: 'approve',
      transferRef: 'REF-123',
    });

    expect(result.status).toBe(PaymentStatus.COMPLETED);
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PAY_ID },
        data: expect.objectContaining({ status: PaymentStatus.COMPLETED, gatewayRef: 'REF-123' }),
      }),
    );
    expect(prisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: INVOICE_ID },
        data: expect.objectContaining({ status: InvoiceStatus.PAID }),
      }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      'finance.payment.completed',
      expect.objectContaining({ payload: expect.objectContaining({ invoiceId: INVOICE_ID }) }),
    );
  });

  it('approves partial payment → invoice marked PARTIALLY_PAID, no event emitted', async () => {
    const prisma = buildPrisma();
    const eventBus = buildEventBus();
    prisma.payment.findFirst.mockResolvedValue({
      id: PAY_ID,
      invoiceId: INVOICE_ID,
      amount: 100,
      status: PaymentStatus.PENDING_VERIFICATION,
      gatewayRef: null,
    });
    prisma.payment.update.mockResolvedValue({ id: PAY_ID, status: PaymentStatus.COMPLETED, amount: 100 });
    prisma.invoice.findFirst.mockResolvedValue({
      id: INVOICE_ID,
      total: 230,
      currency: 'SAR',
      bookingId: 'book-1',
    });
    prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 100 } });

    const handler = new VerifyPaymentHandler(prisma as never, eventBus as never, buildRlsTx(prisma));
    await handler.execute({ paymentId: PAY_ID, action: 'approve' });

    expect(prisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: InvoiceStatus.PARTIALLY_PAID }),
      }),
    );
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('rejects (sets FAILED) when action is reject', async () => {
    const prisma = buildPrisma();
    const eventBus = buildEventBus();
    const pendingPayment = { id: PAY_ID, status: PaymentStatus.PENDING_VERIFICATION, gatewayRef: null };
    const failed = { ...pendingPayment, status: PaymentStatus.FAILED, failureReason: 'Bank transfer rejected' };
    prisma.payment.findFirst.mockResolvedValue(pendingPayment);
    prisma.payment.update.mockResolvedValue(failed);

    const handler = new VerifyPaymentHandler(prisma as never, eventBus as never, buildRlsTx(prisma));
    const result = await handler.execute({ paymentId: PAY_ID, action: 'reject' });

    expect(result.status).toBe(PaymentStatus.FAILED);
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PAY_ID },
        data: expect.objectContaining({ status: PaymentStatus.FAILED, failureReason: 'Bank transfer rejected' }),
      }),
    );
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when payment not found', async () => {
    const prisma = buildPrisma();
    const eventBus = buildEventBus();
    prisma.payment.findFirst.mockResolvedValue(null);

    await expect(
      new VerifyPaymentHandler(prisma as never, eventBus as never, buildRlsTx(prisma)).execute({
        paymentId: 'bad',
        action: 'approve',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when payment is not PENDING_VERIFICATION', async () => {
    const prisma = buildPrisma();
    const eventBus = buildEventBus();
    prisma.payment.findFirst.mockResolvedValue({
      id: PAY_ID,
      status: PaymentStatus.COMPLETED,
      gatewayRef: null,
    });

    await expect(
      new VerifyPaymentHandler(prisma as never, eventBus as never, buildRlsTx(prisma)).execute({
        paymentId: PAY_ID,
        action: 'approve',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
