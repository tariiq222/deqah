import { NotFoundException, BadRequestException } from '@nestjs/common';
import { InvoiceStatus, PaymentStatus } from '@prisma/client';
import { RefundPaymentHandler } from './refund-payment/refund-payment.handler';
import { VerifyPaymentHandler } from './verify-payment/verify-payment.handler';
import { createEventBusMock } from '../../../test/fixtures/event-bus';
import { createRlsHelper } from '../../../test/fixtures/rls';
import { createPrismaMock, MockedPayment, MockedInvoice, setupPaymentMock, setupInvoiceMock, setupPaymentUpdateMock, setupInvoiceUpdateMock, setupTransactionMock, setupPaymentAggregateMock, setupRefundRequestMocks } from '../../../test/fixtures/prisma';

const buildMoyasar = () => ({
  createRefund: jest.fn().mockResolvedValue({ id: 'refund-gw-1' }),
});

const PAY_ID = 'pay-1';
const INVOICE_ID = 'inv-1';

const PAYMENT_BASE: MockedPayment = {
  id: PAY_ID,
  amount: 100,
  gatewayRef: 'pay_test_gw_123',
  status: PaymentStatus.COMPLETED,
  invoiceId: INVOICE_ID,
  invoice: {
    id: INVOICE_ID,
    bookingId: 'book-1',
    clientId: 'client-1',
    currency: 'SAR',
    organizationId: 'org-1',
  },
  organizationId: 'org-1',
};

describe('RefundPaymentHandler', () => {
  it('refunds a completed payment + creates RefundRequest + emits RefundCompletedEvent', async () => {
    const prisma = createPrismaMock();
    const eventBus = createEventBusMock();
    const moyasar = buildMoyasar();

    setupPaymentMock(prisma, PAYMENT_BASE);
    setupPaymentUpdateMock(prisma, { ...PAYMENT_BASE, status: PaymentStatus.REFUNDED, failureReason: 'client request' });
    setupInvoiceUpdateMock(prisma, { id: INVOICE_ID });
    setupRefundRequestMocks(prisma);
    setupTransactionMock(prisma);

    const handler = new RefundPaymentHandler(prisma as never, eventBus as never, createRlsHelper(), moyasar as never);
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
    const prisma = createPrismaMock();
    const eventBus = createEventBusMock();
    prisma.payment.findFirst.mockResolvedValue(null);

    await expect(
      new RefundPaymentHandler(prisma as never, eventBus as never, createRlsHelper(), buildMoyasar() as never).execute({ paymentId: 'bad', reason: 'x' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when payment is not COMPLETED', async () => {
    const prisma = createPrismaMock();
    const eventBus = createEventBusMock();
    setupPaymentMock(prisma, { ...PAYMENT_BASE, status: PaymentStatus.PENDING });

    await expect(
      new RefundPaymentHandler(prisma as never, eventBus as never, createRlsHelper(), buildMoyasar() as never).execute({ paymentId: PAY_ID, reason: 'x' }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('VerifyPaymentHandler', () => {
  it('approves (sets COMPLETED), flips invoice to PAID, and publishes PaymentCompletedEvent', async () => {
    const prisma = createPrismaMock();
    const eventBus = createEventBusMock();

    const pendingPayment: MockedPayment = {
      id: PAY_ID,
      invoiceId: INVOICE_ID,
      amount: 230,
      status: PaymentStatus.PENDING_VERIFICATION,
      gatewayRef: null,
      organizationId: 'org-1',
    };

    setupPaymentMock(prisma, pendingPayment);
    setupPaymentUpdateMock(prisma, { ...pendingPayment, status: PaymentStatus.COMPLETED, processedAt: new Date(), gatewayRef: 'REF-123' });

    const invoice: MockedInvoice = {
      id: INVOICE_ID,
      total: 230,
      currency: 'SAR',
      bookingId: 'book-1',
    };
    setupInvoiceMock(prisma, invoice);
    setupPaymentAggregateMock(prisma, { _sum: { amount: 230 } });
    setupInvoiceUpdateMock(prisma, { id: INVOICE_ID, status: InvoiceStatus.PAID });
    setupTransactionMock(prisma);

    const handler = new VerifyPaymentHandler(prisma as never, eventBus as never, createRlsHelper());
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
    const prisma = createPrismaMock();
    const eventBus = createEventBusMock();

    const pendingPayment: MockedPayment = {
      id: PAY_ID,
      invoiceId: INVOICE_ID,
      amount: 100,
      status: PaymentStatus.PENDING_VERIFICATION,
      gatewayRef: null,
      organizationId: 'org-1',
    };

    setupPaymentMock(prisma, pendingPayment);
    setupPaymentUpdateMock(prisma, { id: PAY_ID, status: PaymentStatus.COMPLETED, amount: 100 });

    const invoice: MockedInvoice = {
      id: INVOICE_ID,
      total: 230,
      currency: 'SAR',
      bookingId: 'book-1',
    };
    setupInvoiceMock(prisma, invoice);
    setupPaymentAggregateMock(prisma, { _sum: { amount: 100 } });
    setupTransactionMock(prisma);

    const handler = new VerifyPaymentHandler(prisma as never, eventBus as never, createRlsHelper());
    await handler.execute({ paymentId: PAY_ID, action: 'approve' });

    expect(prisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: InvoiceStatus.PARTIALLY_PAID }),
      }),
    );
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('rejects (sets FAILED) when action is reject', async () => {
    const prisma = createPrismaMock();
    const eventBus = createEventBusMock();

    const pendingPayment: MockedPayment = {
      id: PAY_ID,
      invoiceId: INVOICE_ID,
      status: PaymentStatus.PENDING_VERIFICATION,
      gatewayRef: null,
      amount: 100,
      organizationId: 'org-1',
    };
    setupPaymentMock(prisma, pendingPayment);
    setupPaymentUpdateMock(prisma, { ...pendingPayment, status: PaymentStatus.FAILED, failureReason: 'Bank transfer rejected' });

    const handler = new VerifyPaymentHandler(prisma as never, eventBus as never, createRlsHelper());
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
    const prisma = createPrismaMock();
    const eventBus = createEventBusMock();
    prisma.payment.findFirst.mockResolvedValue(null);

    await expect(
      new VerifyPaymentHandler(prisma as never, eventBus as never, createRlsHelper()).execute({
        paymentId: 'bad',
        action: 'approve',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when payment is not PENDING_VERIFICATION', async () => {
    const prisma = createPrismaMock();
    const eventBus = createEventBusMock();
    setupPaymentMock(prisma, { ...PAYMENT_BASE, status: PaymentStatus.COMPLETED, gatewayRef: null });

    await expect(
      new VerifyPaymentHandler(prisma as never, eventBus as never, createRlsHelper()).execute({
        paymentId: PAY_ID,
        action: 'approve',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
