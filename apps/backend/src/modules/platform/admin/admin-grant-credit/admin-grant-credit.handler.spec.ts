import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SuperAdminActionType } from '@prisma/client';
import { AdminGrantCreditHandler } from './admin-grant-credit.handler';
import { PrismaService } from '../../../../infrastructure/database';

describe('AdminGrantCreditHandler', () => {
  let handler: AdminGrantCreditHandler;
  let orgFindUnique: jest.Mock;
  let creditCreate: jest.Mock;
  let logCreate: jest.Mock;

  beforeEach(async () => {
    orgFindUnique = jest.fn();
    creditCreate = jest.fn();
    logCreate = jest.fn();
    const tx = {
      organization: { findUnique: orgFindUnique },
      billingCredit: { create: creditCreate },
      superAdminActionLog: { create: logCreate },
    };
    const prismaMock = {
      $allTenants: {
        $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      },
    } as unknown as PrismaService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminGrantCreditHandler,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    handler = moduleRef.get(AdminGrantCreditHandler);
  });

  const cmd = {
    organizationId: 'o1',
    amount: 50,
    currency: 'SAR',
    superAdminUserId: 'sa1',
    ipAddress: '1.2.3.4',
    userAgent: 'jest',
  };

  it('creates credit + audit row in same transaction', async () => {
    orgFindUnique.mockResolvedValue({ id: 'o1' });
    creditCreate.mockResolvedValue({
      id: 'c1',
      organizationId: 'o1',
      amount: { toString: () => '50.00' },
      currency: 'SAR',
      reason: null,
      grantedByUserId: 'sa1',
      grantedAt: new Date(),
    });
    logCreate.mockResolvedValue({});

    const result = await handler.execute(cmd);

    expect(result.id).toBe('c1');
    expect(creditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'o1',
          currency: 'SAR',
          reason: null,
          grantedByUserId: 'sa1',
        }),
      }),
    );
    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actionType: SuperAdminActionType.BILLING_GRANT_CREDIT,
          organizationId: 'o1',
          reason: null,
        }),
      }),
    );
  });

  it('throws when org missing', async () => {
    orgFindUnique.mockResolvedValue(null);

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(NotFoundException);
    expect(creditCreate).not.toHaveBeenCalled();
    expect(logCreate).not.toHaveBeenCalled();
  });

  it('passes the granting super-admin id correctly', async () => {
    orgFindUnique.mockResolvedValue({ id: 'o1' });
    creditCreate.mockResolvedValue({
      id: 'c1',
      organizationId: 'o1',
      amount: { toString: () => '50' },
      currency: 'SAR',
      reason: null,
      grantedByUserId: 'sa1',
      grantedAt: new Date(),
    });
    logCreate.mockResolvedValue({});

    await handler.execute({ ...cmd, superAdminUserId: 'sa-different' });

    expect(creditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ grantedByUserId: 'sa-different' }),
      }),
    );
  });
});
