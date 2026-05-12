import { NotFoundException } from '@nestjs/common';
import { GetBookingInvoiceHandler } from './get-booking-invoice.handler';

const mockInvoice = {
  id: 'inv-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  clientId: 'client-1',
  employeeId: 'emp-1',
  bookingId: 'booking-1',
  subtotal: '100.00',
  discountAmt: '10.00',
  vatRate: '0.15',
  vatAmt: '13.50',
  total: '103.50',
  refundedAmount: '0.00',
  refundedVatAmt: '0.00',
  currency: 'SAR',
  status: 'PAID',
  issuedAt: new Date('2026-04-17T10:00:00Z'),
  dueAt: null,
  paidAt: new Date('2026-04-17T10:05:00Z'),
  createdAt: new Date('2026-04-17T10:00:00Z'),
};

describe('GetBookingInvoiceHandler', () => {
  const buildPrisma = (invoice: typeof mockInvoice | null = mockInvoice) => ({
    invoice: { findFirst: jest.fn().mockResolvedValue(invoice) },
    brandingConfig: {
      findUnique: jest.fn().mockResolvedValue({
        organizationNameEn: 'Fallback Clinic',
        organizationNameAr: 'عيادة احتياطية',
      }),
    },
  });

  it('returns invoice scoped to booking + client', async () => {
    const prisma = buildPrisma();
    const handler = new GetBookingInvoiceHandler(prisma as never);

    const result = await handler.execute('booking-1', 'client-1');

    expect(prisma.invoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bookingId: 'booking-1', clientId: 'client-1' },
      }),
    );
    expect(result.id).toBe('inv-1');
    expect(result.total).toBe(103.5);
  });

  it('returns the seller name from BrandingConfig', async () => {
    const prisma = buildPrisma();
    const handler = new GetBookingInvoiceHandler(prisma as never);

    const result = await handler.execute('booking-1', 'client-1');

    expect(prisma.brandingConfig.findUnique).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      select: { organizationNameEn: true, organizationNameAr: true },
    });
    expect(result.sellerName).toBe('Fallback Clinic');
  });

  it('throws NotFoundException when no invoice belongs to the booking for this client', async () => {
    const prisma = buildPrisma(null);
    const handler = new GetBookingInvoiceHandler(prisma as never);

    await expect(handler.execute('booking-x', 'client-1')).rejects.toThrow(NotFoundException);
  });
});
