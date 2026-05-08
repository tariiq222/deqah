import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RefundPaymentHandler } from './refund-payment.handler';
import { PrismaService } from '../../../infrastructure/database';
import { EventBusService } from '../../../infrastructure/events';
import { RlsHelper } from '../../../common/tenant/rls.helper';
import { MoyasarApiClient } from '../moyasar-api/moyasar-api.client';

describe('RefundPaymentHandler', () => {
  let handler: RefundPaymentHandler;
  let moyasar: { createRefund: jest.Mock };
  let prisma: any;
  let eventBus: { publish: jest.Mock };

  beforeEach(async () => {
    moyasar = { createRefund: jest.fn() };
    prisma = {
      payment: { findFirst: jest.fn(), update: jest.fn() },
      refundRequest: { create: jest.fn(), update: jest.fn() },
      invoice: { update: jest.fn() },
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    eventBus = { publish: jest.fn().mockResolvedValue(undefined) };
    const rls = { applyInTransaction: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        RefundPaymentHandler,
        { provide: PrismaService, useValue: prisma },
        { provide: EventBusService, useValue: eventBus },
        { provide: RlsHelper, useValue: rls },
        { provide: MoyasarApiClient, useValue: moyasar },
      ],
    }).compile();
    handler = module.get(RefundPaymentHandler);
  });

  const completedPayment = (overrides: any = {}) => ({
    id: 'pay_1',
    status: 'COMPLETED',
    amount: 100,
    gatewayRef: 'moyasar_pay_abc',
    invoice: { id: 'inv_1', bookingId: 'bk_1', clientId: 'cli_1', currency: 'SAR', organizationId: 'org_1' },
    ...overrides,
  });

  it('records RefundRequest in PROCESSING BEFORE calling Moyasar (breadcrumb for reconciliation)', async () => {
    const callOrder: string[] = [];
    prisma.payment.findFirst.mockResolvedValue(completedPayment());
    prisma.refundRequest.create.mockImplementation(async () => { callOrder.push('refundRequest.create'); return { id: 'rr_1' }; });
    moyasar.createRefund.mockImplementation(async () => {
      callOrder.push('moyasar');
      return { id: 'ref_xyz', amount: 10000, currency: 'SAR', status: 'refunded', paymentId: 'moyasar_pay_abc', createdAt: new Date().toISOString() };
    });
    prisma.refundRequest.update.mockImplementation(async () => { callOrder.push('refundRequest.update'); return {}; });
    prisma.payment.update.mockImplementation(async () => { callOrder.push('payment.update'); return {}; });
    prisma.invoice.update.mockImplementation(async () => { callOrder.push('invoice.update'); return {}; });

    await handler.execute({ paymentId: 'pay_1', reason: 'test' });

    expect(callOrder[0]).toBe('refundRequest.create');
    expect(callOrder[1]).toBe('moyasar');
    expect(prisma.refundRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PROCESSING' }),
    }));
  });

  it('forwards Idempotency-Key as refund:<paymentId>:<amount> to Moyasar', async () => {
    prisma.payment.findFirst.mockResolvedValue(completedPayment());
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
    prisma.payment.findFirst.mockResolvedValue(completedPayment());
    prisma.refundRequest.create.mockResolvedValue({ id: 'rr_1' });
    moyasar.createRefund.mockResolvedValue({ id: 'ref_xyz', amount: 10000, currency: 'SAR', status: 'refunded', paymentId: 'moyasar_pay_abc', createdAt: new Date().toISOString() });
    prisma.refundRequest.update.mockResolvedValue({});
    prisma.payment.update.mockResolvedValue({});
    prisma.invoice.update.mockResolvedValue({});

    await handler.execute({ paymentId: 'pay_1', reason: 'test' });

    // gatewayRef is persisted on the FINALIZE update, not on the initial create
    expect(prisma.refundRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'COMPLETED', gatewayRef: 'ref_xyz' }),
    }));
  });

  it('marks RefundRequest FAILED if Moyasar throws (no money moved)', async () => {
    prisma.payment.findFirst.mockResolvedValue(completedPayment());
    prisma.refundRequest.create.mockResolvedValue({ id: 'rr_1' });
    prisma.refundRequest.update.mockResolvedValue({});
    moyasar.createRefund.mockRejectedValue(new Error('Moyasar 502'));

    await expect(handler.execute({ paymentId: 'pay_1', reason: 'test' })).rejects.toThrow('Moyasar 502');
    // The pre-Moyasar PROCESSING row was created; finalize never ran;
    // catch block flips it to FAILED so it's safe to retry.
    expect(prisma.refundRequest.create).toHaveBeenCalled();
    expect(prisma.refundRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'FAILED' }),
    }));
    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(prisma.invoice.update).not.toHaveBeenCalled();
  });

  it('preserves gatewayRef on partial-success (Moyasar OK, finalize tx fails)', async () => {
    prisma.payment.findFirst.mockResolvedValue(completedPayment());
    prisma.refundRequest.create.mockResolvedValue({ id: 'rr_1' });
    moyasar.createRefund.mockResolvedValue({ id: 'ref_partial', amount: 10000, currency: 'SAR', status: 'refunded', paymentId: 'moyasar_pay_abc', createdAt: new Date().toISOString() });
    // Make the finalize transaction fail — money already moved at Moyasar
    prisma.$transaction = jest.fn().mockRejectedValue(new Error('DB unavailable'));
    prisma.refundRequest.update.mockResolvedValue({});

    await expect(handler.execute({ paymentId: 'pay_1', reason: 'test' })).rejects.toThrow('DB unavailable');
    // gatewayRef must be persisted so reconciliation can finalize the row
    expect(prisma.refundRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ gatewayRef: 'ref_partial' }),
    }));
    // Row is left in PROCESSING (not FAILED) because money DID move
    const failedCalls = (prisma.refundRequest.update as jest.Mock).mock.calls.filter(
      (c: any[]) => c[0]?.data?.status === 'FAILED',
    );
    expect(failedCalls).toHaveLength(0);
  });

  it('throws NotFound if payment is missing', async () => {
    prisma.payment.findFirst.mockResolvedValue(null);
    await expect(handler.execute({ paymentId: 'missing', reason: 'x' })).rejects.toThrow(NotFoundException);
    expect(moyasar.createRefund).not.toHaveBeenCalled();
  });

  it('throws BadRequest if payment is not COMPLETED', async () => {
    prisma.payment.findFirst.mockResolvedValue({ ...completedPayment(), status: 'PENDING' });
    await expect(handler.execute({ paymentId: 'pay_1', reason: 'x' })).rejects.toThrow(BadRequestException);
    expect(moyasar.createRefund).not.toHaveBeenCalled();
  });

  it('throws BadRequest if payment has no gatewayRef', async () => {
    prisma.payment.findFirst.mockResolvedValue(completedPayment({ gatewayRef: null }));
    await expect(handler.execute({ paymentId: 'pay_1', reason: 'x' })).rejects.toThrow(/gateway reference/i);
    expect(moyasar.createRefund).not.toHaveBeenCalled();
  });
});
