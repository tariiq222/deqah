import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RefundPaymentHandler } from './refund-payment.handler';
import { PrismaService, RlsTransactionService } from '../../../infrastructure/database';
import { EventBusService } from '../../../infrastructure/events';
import { MoyasarApiClient } from '../moyasar-api/moyasar-api.client';

describe('RefundPaymentHandler', () => {
  let handler: RefundPaymentHandler;
  let moyasar: { createRefund: jest.Mock };
  let prisma: any;
  let eventBus: { publish: jest.Mock };
  let rlsTx: { withTransaction: jest.Mock };

  beforeEach(async () => {
    moyasar = { createRefund: jest.fn() };
    prisma = {
      $transaction: jest.fn(), // must NOT be called after fix#3
      $queryRaw: jest.fn().mockResolvedValue([]),
      payment: { findFirst: jest.fn(), update: jest.fn() },
      refundRequest: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      invoice: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'inv_1', bookingId: 'bk_1', clientId: 'cli_1', currency: 'SAR', organizationId: 'org_1' }), update: jest.fn() },
    };
    eventBus = { publish: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        RefundPaymentHandler,
        { provide: PrismaService, useValue: prisma },
        { provide: EventBusService, useValue: eventBus },
        {
          provide: RlsTransactionService,
          useValue: {
            withTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
          },
        },
        { provide: MoyasarApiClient, useValue: moyasar },
      ],
    }).compile();
    handler = module.get(RefundPaymentHandler);
    rlsTx = module.get(RlsTransactionService) as unknown as { withTransaction: jest.Mock };
  });

  const completedPayment = (overrides: any = {}) => ({
    id: 'pay_1',
    status: 'COMPLETED',
    amount: 100,
    gatewayRef: 'moyasar_pay_abc',
    invoice: { id: 'inv_1', bookingId: 'bk_1', clientId: 'cli_1', currency: 'SAR', organizationId: 'org_1' },
    ...overrides,
  });

  const buildPaymentRow = (overrides: any = {}) => ({
    id: 'pay_1',
    status: 'COMPLETED',
    gatewayRef: 'moyasar_pay_abc',
    amount: 100,
    invoiceId: 'inv_1',
    ...overrides,
  });

  it('records RefundRequest in PROCESSING BEFORE calling Moyasar (breadcrumb for reconciliation)', async () => {
    const callOrder: string[] = [];
    prisma.$queryRaw.mockResolvedValueOnce([buildPaymentRow()]);
    prisma.refundRequest.findFirst.mockImplementation(async () => { callOrder.push('refundRequest.findFirst'); return null; });
    prisma.refundRequest.create.mockImplementation(async () => { callOrder.push('refundRequest.create'); return { id: 'rr_1' }; });
    moyasar.createRefund.mockImplementation(async () => {
      callOrder.push('moyasar');
      return { id: 'ref_xyz', amount: 10000, currency: 'SAR', status: 'refunded', paymentId: 'moyasar_pay_abc', createdAt: new Date().toISOString() };
    });
    prisma.refundRequest.update.mockImplementation(async () => { callOrder.push('refundRequest.update'); return {}; });
    prisma.invoice.update.mockImplementation(async () => { callOrder.push('invoice.update'); return {}; });

    await handler.execute({ paymentId: 'pay_1', reason: 'test' });

    // Locking tx order: check existing in-flight refund → refundRequest.create
    // Then: moyasar call (outside tx)
    expect(callOrder.indexOf('refundRequest.create')).toBeLessThan(callOrder.indexOf('moyasar'));
    expect(prisma.refundRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PROCESSING' }),
    }));
  });

  it('forwards Idempotency-Key as refund:<paymentId>:<amount> to Moyasar', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([buildPaymentRow()]);
    prisma.refundRequest.create.mockResolvedValue({ id: 'rr_1' });
    prisma.refundRequest.update.mockResolvedValue({});
    moyasar.createRefund.mockResolvedValue({ id: 'ref_xyz', amount: 10000, currency: 'SAR', status: 'refunded', paymentId: 'moyasar_pay_abc', createdAt: new Date().toISOString() });
    prisma.payment.update.mockResolvedValue({});
    prisma.invoice.update.mockResolvedValue({});

    await handler.execute({ paymentId: 'pay_1', reason: 'test' });

    expect(moyasar.createRefund).toHaveBeenCalledWith('org_1', expect.objectContaining({
      paymentId: 'moyasar_pay_abc',
      amount: expect.any(Number),
      idempotencyKey: 'refund:pay_1:100.00',
    }));
  });

  it('persists gatewayRef from Moyasar onto RefundRequest in finalize step', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([buildPaymentRow()]);
    prisma.refundRequest.create.mockResolvedValue({ id: 'rr_1' });
    moyasar.createRefund.mockResolvedValue({ id: 'ref_xyz', amount: 10000, currency: 'SAR', status: 'refunded', paymentId: 'moyasar_pay_abc', createdAt: new Date().toISOString() });
    prisma.refundRequest.update.mockResolvedValue({});
    prisma.payment.update.mockResolvedValue({});
    prisma.invoice.update.mockResolvedValue({});

    await handler.execute({ paymentId: 'pay_1', reason: 'test' });

    expect(prisma.refundRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'COMPLETED', gatewayRef: 'ref_xyz' }),
    }));
  });

  it('marks RefundRequest FAILED if Moyasar throws (no money moved)', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([buildPaymentRow()]);
    prisma.refundRequest.create.mockResolvedValue({ id: 'rr_1' });
    prisma.refundRequest.update.mockResolvedValue({});
    moyasar.createRefund.mockRejectedValue(new Error('Moyasar 502'));

    await expect(handler.execute({ paymentId: 'pay_1', reason: 'test' })).rejects.toThrow('Moyasar 502');
    expect(prisma.refundRequest.create).toHaveBeenCalled();
    expect(prisma.refundRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'FAILED' }),
    }));
    // invoice.update must NOT be called because no money moved.
    expect(prisma.invoice.update).not.toHaveBeenCalled();
  });

  it('preserves gatewayRef on partial-success (Moyasar OK, finalize tx fails)', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([buildPaymentRow()]);
    prisma.refundRequest.create.mockResolvedValue({ id: 'rr_1' });
    moyasar.createRefund.mockResolvedValue({ id: 'ref_partial', amount: 10000, currency: 'SAR', status: 'refunded', paymentId: 'moyasar_pay_abc', createdAt: new Date().toISOString() });
    // First call (locking tx) succeeds; second call (finalize tx) fails
    rlsTx.withTransaction = jest.fn()
      .mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma))
      .mockRejectedValueOnce(new Error('DB unavailable'));
    prisma.refundRequest.update.mockResolvedValue({});

    await expect(handler.execute({ paymentId: 'pay_1', reason: 'test' })).rejects.toThrow('DB unavailable');
    expect(prisma.refundRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ gatewayRef: 'ref_partial' }),
    }));
    const failedCalls = (prisma.refundRequest.update as jest.Mock).mock.calls.filter(
      (c: any[]) => c[0]?.data?.status === 'FAILED',
    );
    expect(failedCalls).toHaveLength(0);
  });

  it('throws NotFound if payment is missing', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(handler.execute({ paymentId: 'missing', reason: 'x' })).rejects.toThrow(NotFoundException);
    expect(moyasar.createRefund).not.toHaveBeenCalled();
  });

  it('throws BadRequest if payment is not COMPLETED', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ ...buildPaymentRow(), status: 'PENDING' }]);
    await expect(handler.execute({ paymentId: 'pay_1', reason: 'x' })).rejects.toThrow(BadRequestException);
    expect(moyasar.createRefund).not.toHaveBeenCalled();
  });

  it('throws BadRequest if payment has no gatewayRef', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ ...buildPaymentRow(), gatewayRef: null }]);
    await expect(handler.execute({ paymentId: 'pay_1', reason: 'x' })).rejects.toThrow(/gateway reference/i);
    expect(moyasar.createRefund).not.toHaveBeenCalled();
  });

  it('uses RlsTransactionService for both locking and finalize transactions', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([buildPaymentRow()]);
    prisma.refundRequest.create.mockResolvedValue({ id: 'rr_1' });
    moyasar.createRefund.mockResolvedValue({ id: 'ref_xyz', amount: 10000, currency: 'SAR', status: 'refunded', paymentId: 'moyasar_pay_abc', createdAt: new Date().toISOString() });
    prisma.refundRequest.update.mockResolvedValue({});
    prisma.payment.update.mockResolvedValue({});
    prisma.invoice.update.mockResolvedValue({});

    await handler.execute({ paymentId: 'pay_1', reason: 'test' });

    // withTransaction called twice: once for locking, once for finalize
    expect(rlsTx.withTransaction).toHaveBeenCalledTimes(2);
    // prisma.$transaction must NOT have been called
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  describe('createRefundRequestInTx', () => {
    it('acquires SELECT FOR UPDATE lock on the Payment row', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([buildPaymentRow()]);
      prisma.refundRequest.findFirst.mockResolvedValue(null);
      prisma.invoice.findUniqueOrThrow.mockResolvedValue({ id: 'inv_1', bookingId: 'bk_1', clientId: 'cli_1', currency: 'SAR', organizationId: 'org_1' });
      prisma.refundRequest.create.mockResolvedValue({ id: 'rr_1' });

      await handler.createRefundRequestInTx(prisma, { paymentId: 'pay_1', reason: 'test' });

      expect(prisma.$queryRaw).toHaveBeenCalled();
      const callStrings = (prisma.$queryRaw as jest.Mock).mock.calls[0][0];
      expect(callStrings.join('')).toContain('FOR UPDATE');
    });

    it('creates RefundRequest in PROCESSING with correct idempotency key format', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([buildPaymentRow({ amount: 100 })]);
      prisma.refundRequest.findFirst.mockResolvedValue(null);
      prisma.invoice.findUniqueOrThrow.mockResolvedValue({ id: 'inv_1', bookingId: 'bk_1', clientId: 'cli_1', currency: 'SAR', organizationId: 'org_1' });
      prisma.refundRequest.create.mockResolvedValue({ id: 'rr_1' });

      await handler.createRefundRequestInTx(prisma, { paymentId: 'pay_1', reason: 'test' });

      expect(prisma.refundRequest.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'PROCESSING' }),
      }));
      expect(prisma.refundRequest.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ id: expect.stringMatching(/^[0-9a-f-]{36}$/) }),
      }));
    });

    it('idempotency key is formatted as refund:{paymentId}:{amount.toFixed(2)}', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([buildPaymentRow({ id: 'pay_abc', amount: 250 })]);
      prisma.refundRequest.findFirst.mockResolvedValue(null);
      prisma.invoice.findUniqueOrThrow.mockResolvedValue({ id: 'inv_1', bookingId: 'bk_1', clientId: 'cli_1', currency: 'SAR', organizationId: 'org_1' });
      prisma.refundRequest.create.mockResolvedValue({ id: 'rr_1' });

      const result = await handler.createRefundRequestInTx(prisma, { paymentId: 'pay_abc', reason: 'test' });

      expect(result.idempotencyKey).toBe('refund:pay_abc:250.00');
    });

    it('throws BadRequestException if an in-flight refund already exists', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([buildPaymentRow()]);
      prisma.refundRequest.findFirst.mockResolvedValue({ id: 'existing_rr' });

      await expect(handler.createRefundRequestInTx(prisma, { paymentId: 'pay_1', reason: 'test' }))
        .rejects.toThrow(BadRequestException);
      expect(prisma.refundRequest.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException if payment does not exist', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);

      await expect(handler.createRefundRequestInTx(prisma, { paymentId: 'missing', reason: 'test' }))
        .rejects.toThrow(NotFoundException);
    });

    it('returns refundRequestId, idempotencyKey, and payment object', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([buildPaymentRow({ id: 'pay_1', amount: 100 })]);
      prisma.refundRequest.findFirst.mockResolvedValue(null);
      prisma.invoice.findUniqueOrThrow.mockResolvedValue({ id: 'inv_1', bookingId: 'bk_1', clientId: 'cli_1', currency: 'SAR', organizationId: 'org_1' });
      prisma.refundRequest.create.mockResolvedValue({ id: 'rr_1' });

      const result = await handler.createRefundRequestInTx(prisma, { paymentId: 'pay_1', reason: 'test' });

      expect(result).toEqual(expect.objectContaining({
        refundRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        idempotencyKey: 'refund:pay_1:100.00',
        payment: expect.objectContaining({
          id: 'pay_1',
          gatewayRef: 'moyasar_pay_abc',
          amount: 100,
          invoice: { id: 'inv_1', bookingId: 'bk_1', clientId: 'cli_1', currency: 'SAR', organizationId: 'org_1' },
        }),
      }));
    });

    it('uses the tx parameter without calling rlsTx.withTransaction', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([buildPaymentRow()]);
      prisma.refundRequest.findFirst.mockResolvedValue(null);
      prisma.invoice.findUniqueOrThrow.mockResolvedValue({ id: 'inv_1', bookingId: 'bk_1', clientId: 'cli_1', currency: 'SAR', organizationId: 'org_1' });
      prisma.refundRequest.create.mockResolvedValue({ id: 'rr_1' });

      await handler.createRefundRequestInTx(prisma, { paymentId: 'pay_1', reason: 'test' });

      expect(rlsTx.withTransaction).not.toHaveBeenCalled();
    });
  });

  describe('finalizeRefundFromCancellation', () => {
    const baseRefundReq = { id: 'rr_1', paymentId: 'pay_1', amount: 100, invoiceId: 'inv_1', organizationId: 'org_1' };
    const basePayment = { id: 'pay_1', gatewayRef: 'moyasar_pay_abc' };

    beforeEach(() => {
      prisma.refundRequest.findUniqueOrThrow = jest.fn().mockResolvedValue(baseRefundReq);
      prisma.payment.findUniqueOrThrow = jest.fn().mockResolvedValue(basePayment);
      prisma.refundRequest.update.mockResolvedValue({});
      prisma.payment.update.mockResolvedValue({});
      prisma.invoice.update.mockResolvedValue({});
      prisma.invoice.findUnique = jest.fn().mockResolvedValue({ id: 'inv_1', bookingId: 'bk_1', currency: 'SAR', organizationId: 'org_1' });
    });

    it('calls Moyasar with the idempotencyKey', async () => {
      moyasar.createRefund.mockResolvedValue({ id: 'ref_xyz', amount: 10000, currency: 'SAR', status: 'refunded', paymentId: 'moyasar_pay_abc', createdAt: new Date().toISOString() });

      await handler.finalizeRefundFromCancellation({ refundRequestId: 'rr_1', idempotencyKey: 'refund:pay_1:100.00' });

      expect(moyasar.createRefund).toHaveBeenCalledWith('org_1', {
        paymentId: 'moyasar_pay_abc',
        amount: 10000,
        idempotencyKey: 'refund:pay_1:100.00',
      });
    });

    it('calls rlsTx.withTransaction for the finalize step', async () => {
      moyasar.createRefund.mockResolvedValue({ id: 'ref_xyz', amount: 10000, currency: 'SAR', status: 'refunded', paymentId: 'moyasar_pay_abc', createdAt: new Date().toISOString() });

      await handler.finalizeRefundFromCancellation({ refundRequestId: 'rr_1', idempotencyKey: 'refund:pay_1:100.00' });

      expect(rlsTx.withTransaction).toHaveBeenCalledTimes(1);
      const withTransactionCall = (rlsTx.withTransaction as jest.Mock).mock.calls[0][0];
      await withTransactionCall(prisma);
      expect(prisma.refundRequest.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'rr_1' },
        data: { status: 'COMPLETED', gatewayRef: 'ref_xyz' },
      }));
      expect(prisma.payment.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'pay_1' },
        data: expect.objectContaining({ status: 'REFUNDED' }),
      }));
      expect(prisma.invoice.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'inv_1' },
        data: { status: 'REFUNDED' },
      }));
    });

    it('publishes RefundCompletedEvent', async () => {
      moyasar.createRefund.mockResolvedValue({ id: 'ref_xyz', amount: 10000, currency: 'SAR', status: 'refunded', paymentId: 'moyasar_pay_abc', createdAt: new Date().toISOString() });

      await handler.finalizeRefundFromCancellation({ refundRequestId: 'rr_1', idempotencyKey: 'refund:pay_1:100.00' });

      expect(eventBus.publish).toHaveBeenCalledWith(
        'finance.refund.completed',
        expect.objectContaining({ payload: expect.objectContaining({ refundRequestId: 'rr_1', organizationId: 'org_1', paymentId: 'pay_1' }) }),
      );
    });

    it('throws if Moyasar fails', async () => {
      moyasar.createRefund.mockRejectedValue(new Error('Moyasar 502'));

      await expect(handler.finalizeRefundFromCancellation({ refundRequestId: 'rr_1', idempotencyKey: 'refund:pay_1:100.00' }))
        .rejects.toThrow('Moyasar 502');
      expect(rlsTx.withTransaction).not.toHaveBeenCalled();
    });
  });
});
