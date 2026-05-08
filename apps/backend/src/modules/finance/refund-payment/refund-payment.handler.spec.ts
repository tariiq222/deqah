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
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
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

  it('calls Moyasar.createRefund BEFORE flipping DB rows', async () => {
    const callOrder: string[] = [];
    prisma.payment.findFirst.mockResolvedValue(completedPayment());
    moyasar.createRefund.mockImplementation(async () => {
      callOrder.push('moyasar');
      return { id: 'ref_xyz', amount: 10000, currency: 'SAR', status: 'refunded', paymentId: 'moyasar_pay_abc', createdAt: new Date().toISOString() };
    });
    prisma.refundRequest.create.mockImplementation(async () => { callOrder.push('refundRequest.create'); return { id: 'rr_1' }; });
    prisma.payment.update.mockImplementation(async () => { callOrder.push('payment.update'); return {}; });
    prisma.invoice.update.mockImplementation(async () => { callOrder.push('invoice.update'); return {}; });

    await handler.execute({ paymentId: 'pay_1', reason: 'test' });

    expect(callOrder[0]).toBe('moyasar');
  });

  it('forwards Idempotency-Key as refund:<uuid> to Moyasar', async () => {
    prisma.payment.findFirst.mockResolvedValue(completedPayment());
    moyasar.createRefund.mockResolvedValue({ id: 'ref_xyz', amount: 10000, currency: 'SAR', status: 'refunded', paymentId: 'moyasar_pay_abc', createdAt: new Date().toISOString() });
    prisma.refundRequest.create.mockResolvedValue({ id: 'rr_1' });
    prisma.payment.update.mockResolvedValue({});
    prisma.invoice.update.mockResolvedValue({});

    await handler.execute({ paymentId: 'pay_1', reason: 'test' });

    expect(moyasar.createRefund).toHaveBeenCalledWith('org_1', expect.objectContaining({
      paymentId: 'moyasar_pay_abc',
      amount: expect.any(Number),
      idempotencyKey: 'refund:pay_1:100.00',
    }));
  });

  it('persists gatewayRef from Moyasar onto RefundRequest', async () => {
    prisma.payment.findFirst.mockResolvedValue(completedPayment());
    moyasar.createRefund.mockResolvedValue({ id: 'ref_xyz', amount: 10000, currency: 'SAR', status: 'refunded', paymentId: 'moyasar_pay_abc', createdAt: new Date().toISOString() });
    prisma.refundRequest.create.mockResolvedValue({ id: 'rr_1' });
    prisma.payment.update.mockResolvedValue({});
    prisma.invoice.update.mockResolvedValue({});

    await handler.execute({ paymentId: 'pay_1', reason: 'test' });

    expect(moyasar.createRefund).toHaveBeenCalledWith('org_1', expect.objectContaining({
      paymentId: 'moyasar_pay_abc',
      amount: expect.any(Number),
      idempotencyKey: expect.stringMatching(/^refund:/),
    }));
    expect(prisma.refundRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ gatewayRef: 'ref_xyz' }),
    }));
  });

  it('does NOT mutate DB if Moyasar throws', async () => {
    prisma.payment.findFirst.mockResolvedValue(completedPayment());
    moyasar.createRefund.mockRejectedValue(new Error('Moyasar 502'));

    await expect(handler.execute({ paymentId: 'pay_1', reason: 'test' })).rejects.toThrow('Moyasar 502');
    expect(prisma.refundRequest.create).not.toHaveBeenCalled();
    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(prisma.invoice.update).not.toHaveBeenCalled();
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
