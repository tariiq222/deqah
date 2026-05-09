import { Test } from '@nestjs/testing';
import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  SubscriptionInvoiceStatus,
  SuperAdminActionType,
} from '@prisma/client';
import { AdminRefundInvoiceHandler } from './admin-refund-invoice.handler';
import { PrismaService } from '../../../../infrastructure/database';
import { MoyasarSubscriptionClient } from '../../../finance/moyasar-api/moyasar-subscription.client';

describe('AdminRefundInvoiceHandler', () => {
  let handler: AdminRefundInvoiceHandler;
  let invFindUnique: jest.Mock;
  let invUpdate: jest.Mock;
  let logCreate: jest.Mock;
  let refundPayment: jest.Mock;

  beforeEach(async () => {
    invFindUnique = jest.fn();
    invUpdate = jest.fn();
    logCreate = jest.fn();
    refundPayment = jest.fn();

    const tx = {
      subscriptionInvoice: { update: invUpdate },
      superAdminActionLog: { create: logCreate },
    };
    const prismaMock = {
      $allTenants: {
        subscriptionInvoice: { findUnique: invFindUnique },
        $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      },
    } as unknown as PrismaService;
    const moyasarMock = { refundPayment } as unknown as MoyasarSubscriptionClient;

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminRefundInvoiceHandler,
        { provide: PrismaService, useValue: prismaMock },
        { provide: MoyasarSubscriptionClient, useValue: moyasarMock },
      ],
    }).compile();

    handler = moduleRef.get(AdminRefundInvoiceHandler);
  });

  const baseCmd = {
    invoiceId: 'inv1',
    superAdminUserId: 'sa1',
    ipAddress: '1.2.3.4',
    userAgent: 'jest',
  };

  const paidInvoice = {
    id: 'inv1',
    status: SubscriptionInvoiceStatus.PAID,
    organizationId: 'o1',
    amount: '349.00',
    refundedAmount: null,
    moyasarPaymentId: 'pay_abc',
    currency: 'SAR',
  };

  it('full refund: sets status=VOID, refundedAmount=amount, audited', async () => {
    invFindUnique.mockResolvedValue(paidInvoice);
    refundPayment.mockResolvedValue({ id: 'ref_123', amount: 34900, status: 'refunded' });
    invUpdate.mockResolvedValue({});
    logCreate.mockResolvedValue({});

    await handler.execute(baseCmd);

    expect(refundPayment).toHaveBeenCalledWith({
      paymentId: 'pay_abc',
      amountHalalas: 34900,
      idempotencyKey: 'refund:inv1:349.00',
    });
    expect(invUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: SubscriptionInvoiceStatus.VOID,
        }),
      }),
    );
    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actionType: SuperAdminActionType.BILLING_REFUND,
          metadata: expect.objectContaining({
            moyasarRefundId: 'ref_123',
            fullyRefunded: true,
          }),
        }),
      }),
    );
  });

  it('partial refund: keeps status=PAID, sets refundedAmount=partial', async () => {
    invFindUnique.mockResolvedValue(paidInvoice);
    refundPayment.mockResolvedValue({ id: 'ref_123', amount: 10000, status: 'refunded' });
    invUpdate.mockResolvedValue({});

    await handler.execute({ ...baseCmd, amount: 100 });

    expect(refundPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amountHalalas: 10000, idempotencyKey: 'refund:inv1:100.00' }),
    );
    expect(invUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: SubscriptionInvoiceStatus.PAID }),
      }),
    );
  });

  it('second partial refund stacks correctly + idempotency key reflects new total', async () => {
    invFindUnique.mockResolvedValue({ ...paidInvoice, refundedAmount: '100.00' });
    refundPayment.mockResolvedValue({ id: 'ref_456', amount: 10000, status: 'refunded' });
    invUpdate.mockResolvedValue({});

    await handler.execute({ ...baseCmd, amount: 100 });

    expect(refundPayment).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'refund:inv1:200.00' }),
    );
  });

  it('throws when refund > remaining', async () => {
    invFindUnique.mockResolvedValue({ ...paidInvoice, refundedAmount: '300.00' });

    await expect(handler.execute({ ...baseCmd, amount: 100 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(refundPayment).not.toHaveBeenCalled();
    expect(invUpdate).not.toHaveBeenCalled();
  });

  it('throws when refund amount <= 0', async () => {
    invFindUnique.mockResolvedValue(paidInvoice);

    await expect(handler.execute({ ...baseCmd, amount: 0 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(handler.execute({ ...baseCmd, amount: -50 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws when invoice is not PAID', async () => {
    invFindUnique.mockResolvedValue({
      ...paidInvoice,
      status: SubscriptionInvoiceStatus.DUE,
    });

    await expect(handler.execute(baseCmd)).rejects.toBeInstanceOf(BadRequestException);
    expect(refundPayment).not.toHaveBeenCalled();
  });

  it('throws when invoice missing', async () => {
    invFindUnique.mockResolvedValue(null);

    await expect(handler.execute(baseCmd)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws when moyasarPaymentId missing', async () => {
    invFindUnique.mockResolvedValue({ ...paidInvoice, moyasarPaymentId: null });

    await expect(handler.execute(baseCmd)).rejects.toBeInstanceOf(BadRequestException);
    expect(refundPayment).not.toHaveBeenCalled();
  });

  it('surfaces Moyasar failure as 502 BadGateway, no DB mutation', async () => {
    invFindUnique.mockResolvedValue(paidInvoice);
    refundPayment.mockRejectedValue(new Error('Moyasar refund failed: 503 Service Unavailable'));

    await expect(handler.execute(baseCmd)).rejects.toBeInstanceOf(BadGatewayException);
    expect(invUpdate).not.toHaveBeenCalled();
    expect(logCreate).not.toHaveBeenCalled();
  });
});
