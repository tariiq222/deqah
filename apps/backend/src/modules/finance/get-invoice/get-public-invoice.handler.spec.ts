import { NotFoundException } from '@nestjs/common';
import { GetPublicInvoiceHandler } from './get-public-invoice.handler';

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

describe('GetPublicInvoiceHandler', () => {
  const buildPrisma = (invoice: typeof mockInvoice | null = mockInvoice) => ({
    invoice: { findFirst: jest.fn().mockResolvedValue(invoice) },
    brandingConfig: {
      findUnique: jest.fn().mockResolvedValue({
        organizationNameEn: 'Fallback Clinic',
        organizationNameAr: 'عيادة احتياطية',
      }),
    },
  });

  it('returns invoice scoped to invoice + client', async () => {
    const prisma = buildPrisma();
    const handler = new GetPublicInvoiceHandler(prisma as never);

    const result = await handler.execute('inv-1', 'client-1');

    expect(prisma.invoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv-1', clientId: 'client-1' },
      }),
    );
    expect(result.id).toBe('inv-1');
    expect(result.total).toBe(103.5);
  });

  it('returns the seller name from BrandingConfig (English preferred)', async () => {
    const prisma = buildPrisma();
    const handler = new GetPublicInvoiceHandler(prisma as never);

    const result = await handler.execute('inv-1', 'client-1');

    expect(prisma.brandingConfig.findUnique).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      select: { organizationNameEn: true, organizationNameAr: true },
    });
    expect(result.sellerName).toBe('Fallback Clinic');
  });

  it('falls back to Arabic branding name when English is missing', async () => {
    const prisma = buildPrisma();
    prisma.brandingConfig.findUnique.mockResolvedValueOnce({
      organizationNameEn: null,
      organizationNameAr: 'عيادة احتياطية',
    });
    const handler = new GetPublicInvoiceHandler(prisma as never);

    const result = await handler.execute('inv-1', 'client-1');
    expect(result.sellerName).toBe('عيادة احتياطية');
  });

  it('falls back to "Deqah" when branding has no names', async () => {
    const prisma = buildPrisma();
    prisma.brandingConfig.findUnique.mockResolvedValueOnce({
      organizationNameEn: null,
      organizationNameAr: null,
    });
    const handler = new GetPublicInvoiceHandler(prisma as never);

    const result = await handler.execute('inv-1', 'client-1');
    expect(result.sellerName).toBe('Deqah');
  });

  it('throws NotFoundException when no invoice belongs to this client', async () => {
    const prisma = buildPrisma(null);
    const handler = new GetPublicInvoiceHandler(prisma as never);

    await expect(handler.execute('inv-x', 'client-1')).rejects.toThrow(NotFoundException);
  });
});
