import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  SubscriptionInvoiceStatus,
  SuperAdminActionType,
} from '@prisma/client';
import { AdminWaiveInvoiceHandler } from './admin-waive-invoice.handler';
import { PrismaService } from '../../../../infrastructure/database';

describe('AdminWaiveInvoiceHandler', () => {
  let handler: AdminWaiveInvoiceHandler;
  let invFindUnique: jest.Mock;
  let invUpdate: jest.Mock;
  let logCreate: jest.Mock;

  beforeEach(async () => {
    invFindUnique = jest.fn();
    invUpdate = jest.fn();
    logCreate = jest.fn();
    const tx = {
      subscriptionInvoice: { findUnique: invFindUnique, update: invUpdate },
      superAdminActionLog: { create: logCreate },
    };
    const prismaMock = {
      $allTenants: {
        $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      },
    } as unknown as PrismaService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminWaiveInvoiceHandler,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    handler = moduleRef.get(AdminWaiveInvoiceHandler);
  });

  const cmd = {
    invoiceId: 'inv1',
    superAdminUserId: 'sa1',
    ipAddress: '1.2.3.4',
    userAgent: 'jest',
  };

  it('voids a DUE invoice and writes audit row in same transaction', async () => {
    invFindUnique.mockResolvedValue({
      id: 'inv1',
      status: SubscriptionInvoiceStatus.DUE,
      organizationId: 'o1',
      amount: { toString: () => '349.00' },
    });
    invUpdate.mockResolvedValue({ id: 'inv1', status: SubscriptionInvoiceStatus.VOID });

    await handler.execute(cmd);

    expect(invUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv1' },
        data: { status: SubscriptionInvoiceStatus.VOID, voidedReason: null },
      }),
    );
    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actionType: SuperAdminActionType.BILLING_WAIVE_INVOICE,
          organizationId: 'o1',
          reason: null,
        }),
      }),
    );
  });

  it('voids a FAILED invoice', async () => {
    invFindUnique.mockResolvedValue({
      id: 'inv1',
      status: SubscriptionInvoiceStatus.FAILED,
      organizationId: 'o1',
      amount: { toString: () => '799.00' },
    });
    invUpdate.mockResolvedValue({});

    await handler.execute(cmd);
    expect(invUpdate).toHaveBeenCalled();
  });

  it('throws when invoice is PAID', async () => {
    invFindUnique.mockResolvedValue({
      id: 'inv1',
      status: SubscriptionInvoiceStatus.PAID,
      organizationId: 'o1',
      amount: { toString: () => '349.00' },
    });

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(BadRequestException);
    expect(invUpdate).not.toHaveBeenCalled();
    expect(logCreate).not.toHaveBeenCalled();
  });

  it('throws when invoice is already VOID', async () => {
    invFindUnique.mockResolvedValue({
      id: 'inv1',
      status: SubscriptionInvoiceStatus.VOID,
      organizationId: 'o1',
      amount: { toString: () => '349.00' },
    });

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when invoice is DRAFT', async () => {
    invFindUnique.mockResolvedValue({
      id: 'inv1',
      status: SubscriptionInvoiceStatus.DRAFT,
      organizationId: 'o1',
      amount: { toString: () => '349.00' },
    });

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when invoice missing', async () => {
    invFindUnique.mockResolvedValue(null);

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(NotFoundException);
  });
});
