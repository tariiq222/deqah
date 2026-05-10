import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ApplyCouponHandler } from './apply-coupon.handler';
import { RlsTransactionService } from '../../../infrastructure/database';

const buildTenant = () => ({
  requireOrganizationIdOrDefault: jest.fn().mockReturnValue('00000000-0000-0000-0000-000000000001'),
});

const buildFeatureCheck = (enabled = true) => ({
  isEnabled: jest.fn().mockResolvedValue(enabled),
});
const buildRlsTx = (db: ReturnType<typeof buildPrisma>) =>
  ({
    withTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  } as unknown as RlsTransactionService);

const mockInvoice = {
  id: 'inv-1', subtotal: 200, discountAmt: 0, vatRate: 0.15, vatAmt: 30, total: 230,
};
const mockCoupon = {
  id: 'coupon-1', code: 'SAVE10', isActive: true,
  discountType: 'PERCENTAGE', discountValue: 10, expiresAt: null, maxUses: null, usedCount: 0, minOrderAmt: null,
  maxUsesPerUser: null,
};
const mockRedemption = { id: 'red-1', couponId: 'coupon-1', invoiceId: 'inv-1', discount: 20 };

const buildPrisma = () => {
  const db: {
    invoice: { findFirst: jest.Mock; update: jest.Mock };
    coupon: { findFirst: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    couponRedemption: { findUnique: jest.Mock; count: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  } = {
    invoice: { findFirst: jest.fn().mockResolvedValue(mockInvoice), update: jest.fn() },
    coupon: {
      findFirst: jest.fn().mockResolvedValue(mockCoupon),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    couponRedemption: {
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue(mockRedemption),
    },
    $transaction: jest.fn(),
  };
  db.$transaction = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(db));
  return db;
};

const cmd = { invoiceId: 'inv-1', clientId: 'client-1', code: 'SAVE10' };

describe('ApplyCouponHandler', () => {
  it('applies percentage coupon and returns redemption', async () => {
    const prisma = buildPrisma();
    const handler = new ApplyCouponHandler(prisma as never, buildTenant() as never, buildFeatureCheck() as never, buildRlsTx(prisma));
    const result = await handler.execute(cmd);
    expect(prisma.couponRedemption.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ discount: 20 }) }),
    );
    expect(result.id).toBe('red-1');
  });

  it('throws NotFoundException when invoice not found', async () => {
    const prisma = buildPrisma();
    prisma.invoice.findFirst = jest.fn().mockResolvedValue(null);
    await expect(new ApplyCouponHandler(prisma as never, buildTenant() as never, buildFeatureCheck() as never, buildRlsTx(prisma)).execute(cmd)).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when coupon not found', async () => {
    const prisma = buildPrisma();
    prisma.coupon.findFirst = jest.fn().mockResolvedValue(null);
    await expect(new ApplyCouponHandler(prisma as never, buildTenant() as never, buildFeatureCheck() as never, buildRlsTx(prisma)).execute(cmd)).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when coupon expired', async () => {
    const prisma = buildPrisma();
    prisma.coupon.findFirst = jest.fn().mockResolvedValue({ ...mockCoupon, expiresAt: new Date('2020-01-01') });
    await expect(new ApplyCouponHandler(prisma as never, buildTenant() as never, buildFeatureCheck() as never, buildRlsTx(prisma)).execute(cmd)).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when max uses reached', async () => {
    const prisma = buildPrisma();
    (prisma.coupon as { findFirst: jest.Mock; updateMany: jest.Mock }).findFirst = jest.fn().mockResolvedValue({ ...mockCoupon, maxUses: 10, usedCount: 10 });
    (prisma.coupon as { updateMany: jest.Mock }).updateMany = jest.fn().mockResolvedValue({ count: 0 });
    await expect(new ApplyCouponHandler(prisma as never, buildTenant() as never, buildFeatureCheck() as never, buildRlsTx(prisma)).execute(cmd)).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when coupon already applied', async () => {
    const prisma = buildPrisma();
    prisma.couponRedemption.findUnique = jest.fn().mockResolvedValue(mockRedemption);
    await expect(new ApplyCouponHandler(prisma as never, buildTenant() as never, buildFeatureCheck() as never, buildRlsTx(prisma)).execute(cmd)).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when COUPONS feature is disabled', async () => {
    const prisma = buildPrisma();
    await expect(
      new ApplyCouponHandler(prisma as never, buildTenant() as never, buildFeatureCheck(false) as never, buildRlsTx(prisma)).execute(cmd),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.coupon.findFirst).not.toHaveBeenCalled();
  });
});
