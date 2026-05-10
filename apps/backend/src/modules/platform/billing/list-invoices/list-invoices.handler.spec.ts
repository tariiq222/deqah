import { ListInvoicesHandler } from './list-invoices.handler';

const makeRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'inv-1',
  invoiceNumber: 'INV-2026-000001',
  status: 'PAID',
  amount: { toFixed: (_p: number) => '115.00' },
  currency: 'SAR',
  periodStart: new Date('2026-04-01T00:00:00.000Z'),
  periodEnd: new Date('2026-04-30T00:00:00.000Z'),
  issuedAt: new Date('2026-04-30T12:00:00.000Z'),
  paidAt: new Date('2026-04-30T12:01:00.000Z'),
  createdAt: new Date('2026-04-30T12:00:00.000Z'),
  ...overrides,
});

const buildPrisma = () => ({
  subscriptionInvoice: { findMany: jest.fn() },
  zohoInvoiceLink: { findMany: jest.fn().mockResolvedValue([]) },
});

const buildTenant = (organizationId = 'org-A') => ({
  requireOrganizationId: jest.fn().mockReturnValue(organizationId),
});

describe('ListInvoicesHandler', () => {
  it('returns empty list with nextCursor=null when org has no invoices', async () => {
    const prisma = buildPrisma();
    prisma.subscriptionInvoice.findMany.mockResolvedValue([]);
    const handler = new ListInvoicesHandler(
      prisma as never,
      buildTenant() as never,
    );

    const out = await handler.execute({ limit: 20 });

    expect(out).toEqual({ items: [], nextCursor: null });
  });

  it('filters by organizationId from tenant context', async () => {
    const prisma = buildPrisma();
    prisma.subscriptionInvoice.findMany.mockResolvedValue([makeRow()]);
    const handler = new ListInvoicesHandler(
      prisma as never,
      buildTenant('org-A') as never,
    );

    await handler.execute({ limit: 20 });

    expect(prisma.subscriptionInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-A' }),
      }),
    );
  });

  it('applies status filter when supplied', async () => {
    const prisma = buildPrisma();
    prisma.subscriptionInvoice.findMany.mockResolvedValue([]);
    const handler = new ListInvoicesHandler(
      prisma as never,
      buildTenant() as never,
    );

    await handler.execute({ status: 'PAID' as never });

    expect(prisma.subscriptionInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PAID' }),
      }),
    );
  });

  it('returns nextCursor when more items exist than the limit', async () => {
    const prisma = buildPrisma();
    const rows = Array.from({ length: 3 }, (_, i) =>
      makeRow({ id: `inv-${i + 1}` }),
    );
    prisma.subscriptionInvoice.findMany.mockResolvedValue(rows);
    const handler = new ListInvoicesHandler(
      prisma as never,
      buildTenant() as never,
    );

    const out = await handler.execute({ limit: 2 });

    expect(out.items).toHaveLength(2);
    expect(out.nextCursor).toBe('inv-2');
  });

  it('enriches items with zohoInvoiceUrl and zohoPdfUrl from ZohoInvoiceLink', async () => {
    const prisma = buildPrisma();
    prisma.subscriptionInvoice.findMany.mockResolvedValue([makeRow({ id: 'inv-1' })]);
    prisma.zohoInvoiceLink.findMany.mockResolvedValue([
      {
        deqahInvoiceId: 'inv-1',
        invoiceUrl: 'https://invoice.zoho.sa/portal/inv/1',
        pdfUrl: 'https://invoice.zoho.sa/portal/inv/1/pdf',
      },
    ]);
    const handler = new ListInvoicesHandler(
      prisma as never,
      buildTenant('org-A') as never,
    );

    const out = await handler.execute({ limit: 20 });

    expect(out.items[0].zohoInvoiceUrl).toBe('https://invoice.zoho.sa/portal/inv/1');
    expect(out.items[0].zohoPdfUrl).toBe('https://invoice.zoho.sa/portal/inv/1/pdf');
  });

  it('sets zohoInvoiceUrl and zohoPdfUrl to null when no Zoho mirror exists', async () => {
    const prisma = buildPrisma();
    prisma.subscriptionInvoice.findMany.mockResolvedValue([makeRow()]);
    prisma.zohoInvoiceLink.findMany.mockResolvedValue([]);
    const handler = new ListInvoicesHandler(
      prisma as never,
      buildTenant() as never,
    );

    const out = await handler.execute({ limit: 20 });

    expect(out.items[0].zohoInvoiceUrl).toBeNull();
    expect(out.items[0].zohoPdfUrl).toBeNull();
  });
});
