import { NotFoundException, BadRequestException } from '@nestjs/common';
import { InvoiceStatus, PaymentMethod, Prisma } from '@prisma/client';
import { ProcessPaymentHandler } from './process-payment.handler';
import { RlsTransactionService } from '../../../infrastructure/database';

const mockInvoice = {
  id: 'inv-1',
  bookingId: 'booking-1',
  currency: 'SAR',
  total: 230,
  status: InvoiceStatus.ISSUED,
};

const mockPayment = {
  id: 'pay-1',
  invoiceId: 'inv-1',
  amount: 230,
  method: PaymentMethod.ONLINE_CARD,
  status: 'COMPLETED',
  idempotencyKey: 'key-1',
  processedAt: new Date(),
};

const buildTenant = () => ({
  requireOrganizationIdOrDefault: jest.fn().mockReturnValue('00000000-0000-0000-0000-000000000001'),
});

// Build a tx object that execute() will see inside $transaction. The $transaction
// mock immediately invokes its callback with this tx, simulating a real Prisma
// interactive transaction against the mock.
const buildTx = (overrides: Record<string, unknown> = {}) => ({
  invoice: {
    findFirst: jest.fn().mockResolvedValue(mockInvoice),
    update: jest.fn().mockResolvedValue({ ...mockInvoice, status: InvoiceStatus.PAID }),
  },
  payment: {
    findFirst: jest.fn().mockResolvedValue(mockPayment),
    create: jest.fn().mockResolvedValue(mockPayment),
    aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 230 } }),
  },
  ...overrides,
});

const buildPrisma = (tx = buildTx()) => ({
  ...tx,
  // Outside-of-transaction reads use the Proxy-scoped findFirst.
  invoice: {
    ...tx.invoice,
  },
  $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
});

const buildEventBus = () => ({ publish: jest.fn().mockResolvedValue(undefined) });
const buildRlsTx = (tx: ReturnType<typeof buildTx>) =>
  ({
    withTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
  } as unknown as RlsTransactionService);

describe('ProcessPaymentHandler', () => {
  it('creates payment and marks invoice PAID when fully paid', async () => {
    const tx = buildTx();
    const prisma = buildPrisma(tx);
    const eventBus = buildEventBus();
    const handler = new ProcessPaymentHandler(prisma as never, eventBus as never, buildTenant() as never, buildRlsTx(tx));

    const result = await handler.execute({
      invoiceId: 'inv-1',
      amount: 230,
      method: PaymentMethod.ONLINE_CARD,
      idempotencyKey: 'key-1',
    });

    expect(tx.payment.create).toHaveBeenCalled();
    expect(tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: InvoiceStatus.PAID }) }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      'finance.payment.completed',
      expect.objectContaining({ payload: expect.objectContaining({ bookingId: 'booking-1' }) }),
    );
    expect(result.id).toBe('pay-1');
  });

  it('marks invoice PARTIALLY_PAID when underpaid and does not publish event', async () => {
    const tx = buildTx({
      invoice: {
        findFirst: jest.fn().mockResolvedValue(mockInvoice),
        update: jest.fn().mockResolvedValue(mockInvoice),
      },
      payment: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue(mockPayment),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 100 } }),
      },
    });
    const prisma = buildPrisma(tx);
    const eventBus = buildEventBus();
    const handler = new ProcessPaymentHandler(prisma as never, eventBus as never, buildTenant() as never, buildRlsTx(tx));

    await handler.execute({
      invoiceId: 'inv-1',
      amount: 100,
      method: PaymentMethod.CASH,
    });

    expect(tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: InvoiceStatus.PARTIALLY_PAID }),
      }),
    );
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('returns existing payment when idempotencyKey unique constraint fires', async () => {
    const uniqueError = new Prisma.PrismaClientKnownRequestError('unique violation', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const tx = buildTx({
      invoice: {
        findFirst: jest.fn().mockResolvedValue(mockInvoice),
        update: jest.fn(),
      },
      payment: {
        findFirst: jest.fn().mockResolvedValue(mockPayment),
        create: jest.fn().mockRejectedValue(uniqueError),
        aggregate: jest.fn(),
      },
    });
    const prisma = buildPrisma(tx);
    const handler = new ProcessPaymentHandler(prisma as never, buildEventBus() as never, buildTenant() as never, buildRlsTx(tx));

    const result = await handler.execute({
      invoiceId: 'inv-1',
      amount: 230,
      method: PaymentMethod.ONLINE_CARD,
      idempotencyKey: 'key-1',
    });

    expect(tx.payment.create).toHaveBeenCalled();
    expect(tx.payment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ idempotencyKey: 'key-1' }) }),
    );
    expect(tx.invoice.update).not.toHaveBeenCalled();
    expect(result.id).toBe('pay-1');
  });

  it('throws NotFoundException when invoice not found', async () => {
    const tx = buildTx({
      invoice: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      payment: { findFirst: jest.fn(), create: jest.fn(), aggregate: jest.fn() },
    });
    const prisma = buildPrisma(tx);
    const handler = new ProcessPaymentHandler(prisma as never, buildEventBus() as never, buildTenant() as never, buildRlsTx(tx));

    await expect(
      handler.execute({
        invoiceId: 'bad-id',
        amount: 100,
        method: PaymentMethod.CASH,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when invoice is VOID', async () => {
    const tx = buildTx({
      invoice: {
        findFirst: jest.fn().mockResolvedValue({ ...mockInvoice, status: InvoiceStatus.VOID }),
        update: jest.fn(),
      },
      payment: { findFirst: jest.fn(), create: jest.fn(), aggregate: jest.fn() },
    });
    const prisma = buildPrisma(tx);
    const handler = new ProcessPaymentHandler(prisma as never, buildEventBus() as never, buildTenant() as never, buildRlsTx(tx));

    await expect(
      handler.execute({
        invoiceId: 'inv-1',
        amount: 100,
        method: PaymentMethod.CASH,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
