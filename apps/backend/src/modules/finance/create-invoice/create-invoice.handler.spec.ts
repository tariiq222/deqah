import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateInvoiceHandler } from './create-invoice.handler';

const mockInvoice = {
  id: 'inv-1',
  branchId: 'branch-1',
  clientId: 'client-1',
  employeeId: 'emp-1',
  bookingId: 'booking-1',
  subtotal: 200,
  discountAmt: 0,
  vatRate: 0.15,
  vatAmt: 30,
  total: 230,
  currency: 'SAR',
  status: 'ISSUED',
  issuedAt: new Date(),
  dueAt: null,
  paidAt: null,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  organizationId: '00000000-0000-0000-0000-000000000001',
};

const buildPrisma = () => ({
  invoice: {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(mockInvoice),
  },
});

const buildEventBus = () => ({ publish: jest.fn().mockResolvedValue(undefined) });

const buildTenant = () => ({
  requireOrganizationIdOrDefault: jest.fn().mockReturnValue('00000000-0000-0000-0000-000000000001'),
});

describe('CreateInvoiceHandler', () => {
  it('creates invoice with correct VAT calculation', async () => {
    const prisma = buildPrisma();
    const eventBus = buildEventBus();
    const handler = new CreateInvoiceHandler(prisma as never, eventBus as never, buildTenant() as never);

    const result = await handler.execute({
      branchId: 'branch-1',
      clientId: 'client-1',
      employeeId: 'emp-1',
      bookingId: 'booking-1',
      subtotal: 200,
    });

    expect(prisma.invoice.findUnique).toHaveBeenCalledWith({
      where: { bookingId: 'booking-1' },
      select: { id: true },
    });
    expect(prisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotal: 200,
          vatRate: 0.15,
          vatAmt: 30,
          total: 230,
          status: 'ISSUED',
        }),
      }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      'finance.invoice.created',
      expect.objectContaining({ payload: expect.objectContaining({ bookingId: 'booking-1' }) }),
    );
    expect(result.id).toBe('inv-1');
  });

  it('applies discount before VAT', async () => {
    const prisma = buildPrisma();
    prisma.invoice.create = jest.fn().mockResolvedValue({ ...mockInvoice, discountAmt: 50, vatAmt: 22.5, total: 172.5 });
    const handler = new CreateInvoiceHandler(prisma as never, buildEventBus() as never, buildTenant() as never);

    await handler.execute({
      branchId: 'branch-1',
      clientId: 'client-1',
      employeeId: 'emp-1',
      bookingId: 'booking-1',
      subtotal: 200,
      discountAmt: 50,
    });

    expect(prisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ discountAmt: 50, vatAmt: 22.5, total: 172.5 }),
      }),
    );
  });

  it('throws ConflictException on duplicate bookingId (findUnique returns existing)', async () => {
    const prisma = buildPrisma();
    prisma.invoice.findUnique = jest.fn().mockResolvedValue({ id: 'inv-1' });
    const eventBus = buildEventBus();
    const handler = new CreateInvoiceHandler(prisma as never, eventBus as never, buildTenant() as never);

    await expect(
      handler.execute({
        branchId: 'branch-1',
        clientId: 'client-1',
        employeeId: 'emp-1',
        bookingId: 'booking-1',
        subtotal: 200,
      }),
    ).rejects.toThrow(ConflictException);

    expect(prisma.invoice.create).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('publishes finance.invoice.created exactly once per booking', async () => {
    const prisma = buildPrisma();
    const eventBus = buildEventBus();
    const handler = new CreateInvoiceHandler(prisma as never, eventBus as never, buildTenant() as never);

    await handler.execute({
      branchId: 'branch-1',
      clientId: 'client-1',
      employeeId: 'emp-1',
      bookingId: 'booking-1',
      subtotal: 200,
    });

    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    expect(eventBus.publish).toHaveBeenCalledWith('finance.invoice.created', expect.anything());
  });

  it('throws ConflictException on P2002 race-condition backstop', async () => {
    const prisma = buildPrisma();
    // findUnique returns null (both concurrent callers pass the read)
    prisma.invoice.findUnique = jest.fn().mockResolvedValue(null);
    // create rejects with P2002 (second insert hits unique constraint)
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.0.0',
    });
    prisma.invoice.create = jest.fn().mockRejectedValue(p2002);
    const eventBus = buildEventBus();
    const handler = new CreateInvoiceHandler(prisma as never, eventBus as never, buildTenant() as never);

    await expect(
      handler.execute({
        branchId: 'branch-1',
        clientId: 'client-1',
        employeeId: 'emp-1',
        bookingId: 'booking-1',
        subtotal: 200,
      }),
    ).rejects.toThrow(ConflictException);

    expect(eventBus.publish).not.toHaveBeenCalled();
  });
});
