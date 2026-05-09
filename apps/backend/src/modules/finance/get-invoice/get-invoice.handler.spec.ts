import { NotFoundException } from '@nestjs/common';
import { GetInvoiceHandler } from './get-invoice.handler';
import { ListPaymentsHandler } from '../list-payments/list-payments.handler';
import { PaymentStatus } from '@prisma/client';

const mockInvoice = {
  id: 'inv-1', bookingId: 'booking-1',
  payments: [],
};

const mockPayment = { id: 'pay-1', invoiceId: 'inv-1', status: PaymentStatus.COMPLETED };

describe('GetInvoiceHandler', () => {
  it('returns invoice with payments', async () => {
    const prisma = { invoice: { findFirst: jest.fn().mockResolvedValue(mockInvoice) } };
    const handler = new GetInvoiceHandler(prisma as never);
    const result = await handler.execute({ invoiceId: 'inv-1' });
    expect(result.id).toBe('inv-1');
    expect(prisma.invoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv-1' },
        include: expect.objectContaining({ payments: expect.anything() }),
      }),
    );
  });

  it('throws NotFoundException when invoice not found', async () => {
    const prisma = { invoice: { findFirst: jest.fn().mockResolvedValue(null) } };
    await expect(new GetInvoiceHandler(prisma as never).execute({ invoiceId: 'bad' }))
      .rejects.toThrow(NotFoundException);
  });
});

describe('ListPaymentsHandler', () => {
  const buildPrisma = () => ({
    payment: {
      findMany: jest.fn().mockResolvedValue([mockPayment]),
      count: jest.fn().mockResolvedValue(1),
    },
  });

  it('returns paginated payments', async () => {
    const prisma = buildPrisma();
    const handler = new ListPaymentsHandler(prisma as never);
    const result = await handler.execute({ page: 1, limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });

  it('filters by status', async () => {
    const prisma = buildPrisma();
    const handler = new ListPaymentsHandler(prisma as never);
    await handler.execute({ page: 1, limit: 10, status: PaymentStatus.COMPLETED });
    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: PaymentStatus.COMPLETED }) }),
    );
  });
});
