import { ListPaymentsHandler } from './list-payments.handler';
import { PaymentStatus, PaymentMethod } from '@prisma/client';

const mockPayments = [
  { id: 'pay-1', amount: 100, status: 'COMPLETED', method: 'CARD' as PaymentMethod, invoiceId: 'inv-1', createdAt: new Date() },
];

const buildPrisma = () => ({
  payment: {
    findMany: jest.fn().mockResolvedValue(mockPayments),
    count: jest.fn().mockResolvedValue(1),
  },
});

describe('ListPaymentsHandler', () => {
  it('returns paginated payments', async () => {
    const prisma = buildPrisma();
    const handler = new ListPaymentsHandler(prisma as never);
    const result = await handler.execute({ page: 1, limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });

  it('filters by status when provided', async () => {
    const prisma = buildPrisma();
    const handler = new ListPaymentsHandler(prisma as never);
    await handler.execute({ status: PaymentStatus.COMPLETED, page: 1, limit: 10 });
    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: PaymentStatus.COMPLETED }) }),
    );
  });

  it('filters by clientId through invoice relation', async () => {
    const prisma = buildPrisma();
    const handler = new ListPaymentsHandler(prisma as never);
    await handler.execute({ clientId: 'client-1', page: 1, limit: 10 });
    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ invoice: { clientId: 'client-1' } }) }),
    );
  });

  it('includes date range filtering', async () => {
    const prisma = buildPrisma();
    const handler = new ListPaymentsHandler(prisma as never);
    const fromDate = new Date('2026-01-01');
    const toDate = new Date('2026-01-31');
    await handler.execute({ fromDate, toDate, page: 1, limit: 10 });
    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ createdAt: { gte: fromDate, lte: toDate } }),
      }),
    );
  });
});
