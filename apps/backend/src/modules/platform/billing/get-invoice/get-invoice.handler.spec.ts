import { NotFoundException } from '@nestjs/common';
import { GetInvoiceHandler } from './get-invoice.handler';

const buildPrisma = () => ({
  subscriptionInvoice: { findFirst: jest.fn() },
  zohoInvoiceLink: { findUnique: jest.fn().mockResolvedValue(null) },
});

const buildTenant = (organizationId = 'org-A') => ({
  requireOrganizationId: jest.fn().mockReturnValue(organizationId),
});

describe('GetInvoiceHandler', () => {
  it('throws NotFoundException for cross-org invoice', async () => {
    const prisma = buildPrisma();
    prisma.subscriptionInvoice.findFirst.mockResolvedValue(null);
    const handler = new GetInvoiceHandler(
      prisma as never,
      buildTenant('org-A') as never,
    );

    await expect(handler.execute('inv-from-org-B')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.subscriptionInvoice.findFirst).toHaveBeenCalledWith({
      where: { id: 'inv-from-org-B', organizationId: 'org-A' },
    });
  });

  it('returns the serialized invoice when found', async () => {
    const prisma = buildPrisma();
    prisma.subscriptionInvoice.findFirst.mockResolvedValue({
      id: 'inv-1',
      invoiceNumber: 'INV-2026-000001',
      status: 'PAID',
      amount: { toFixed: (_p: number) => '115.00' },
      currency: 'SAR',
      periodStart: new Date('2026-04-01T00:00:00.000Z'),
      periodEnd: new Date('2026-04-30T00:00:00.000Z'),
      issuedAt: new Date('2026-04-30T12:00:00.000Z'),
      paidAt: new Date('2026-04-30T12:01:00.000Z'),
      invoiceHash: 'a'.repeat(64),
      previousHash: '0',
      pdfStorageKey: 'invoices/org-A/inv-1.pdf',
    });
    const handler = new GetInvoiceHandler(
      prisma as never,
      buildTenant() as never,
    );

    const out = await handler.execute('inv-1');

    expect(out).toEqual({
      id: 'inv-1',
      invoiceNumber: 'INV-2026-000001',
      status: 'PAID',
      amount: '115.00',
      currency: 'SAR',
      periodStart: '2026-04-01T00:00:00.000Z',
      periodEnd: '2026-04-30T00:00:00.000Z',
      issuedAt: '2026-04-30T12:00:00.000Z',
      paidAt: '2026-04-30T12:01:00.000Z',
      invoiceHash: 'a'.repeat(64),
      previousHash: '0',
      pdfStorageKey: 'invoices/org-A/inv-1.pdf',
      zohoInvoiceUrl: null,
      zohoPdfUrl: null,
    });
  });
});
