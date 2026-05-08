import { Test } from '@nestjs/testing';
import { SubscriptionInvoiceStatus } from '@prisma/client';
import { ListZohoSaasInvoicesHandler } from './list-zoho-saas-invoices.handler';
import { PrismaService } from '../../../../infrastructure/database';

const makeOrg = (id = 'org-1') => ({
  id,
  slug: 'clinic',
  nameAr: 'عيادة',
  nameEn: 'Clinic',
  status: 'ACTIVE',
});

const makeSubscription = (overrides: Record<string, unknown> = {}) => ({
  billingCycle: 'MONTHLY',
  currentPeriodEnd: new Date('2026-06-01'),
  status: 'ACTIVE',
  organization: makeOrg(),
  ...overrides,
});

const makeRawInvoice = (id: string, sub = makeSubscription()) => ({
  id,
  subscriptionId: 'sub-1',
  organizationId: 'org-1',
  invoiceNumber: `INV-2026-${id}`,
  amount: 100,
  flatAmount: 100,
  overageAmount: 0,
  currency: 'SAR',
  status: SubscriptionInvoiceStatus.PAID,
  billingCycle: 'MONTHLY',
  periodStart: new Date('2026-05-01'),
  periodEnd: new Date('2026-05-31'),
  dueDate: new Date('2026-05-15'),
  issuedAt: new Date('2026-05-01'),
  paidAt: new Date('2026-05-10'),
  createdAt: new Date('2026-05-01'),
  subscription: sub,
});

describe('ListZohoSaasInvoicesHandler', () => {
  let handler: ListZohoSaasInvoicesHandler;
  let invoiceFindMany: jest.Mock;
  let invoiceCount: jest.Mock;
  let zohoFindMany: jest.Mock;

  beforeEach(async () => {
    invoiceFindMany = jest.fn().mockResolvedValue([]);
    invoiceCount = jest.fn().mockResolvedValue(0);
    zohoFindMany = jest.fn().mockResolvedValue([]);

    const prismaMock = {
      $allTenants: {
        subscriptionInvoice: { findMany: invoiceFindMany, count: invoiceCount },
        zohoInvoiceLink: { findMany: zohoFindMany },
      },
    } as unknown as PrismaService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        ListZohoSaasInvoicesHandler,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    handler = moduleRef.get(ListZohoSaasInvoicesHandler);
  });

  // ── happy path ────────────────────────────────────────────────────────────

  it('excludes drafts by default', async () => {
    await handler.execute({ page: 1, perPage: 20 });
    expect(invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { not: SubscriptionInvoiceStatus.DRAFT },
        }),
      }),
    );
  });

  it('returns empty items and meta when no invoices', async () => {
    invoiceCount.mockResolvedValue(0);
    const result = await handler.execute({ page: 1, perPage: 20 });
    expect(result.items).toHaveLength(0);
    expect(result.meta.total).toBe(0);
    expect(result.meta.totalPages).toBe(1);
  });

  it('hydrates zohoMirror for each invoice', async () => {
    invoiceFindMany.mockResolvedValue([makeRawInvoice('inv-1')]);
    invoiceCount.mockResolvedValue(1);
    zohoFindMany.mockResolvedValue([
      { deqahInvoiceId: 'inv-1', zohoInvoiceId: 'zinv-1', status: 'paid', invoiceUrl: null, pdfUrl: null, viewedAt: null, lastSentAt: null, createdAt: new Date() },
    ]);

    const result = await handler.execute({ page: 1, perPage: 20 });
    expect(result.items[0].zohoMirror).not.toBeNull();
    expect(result.items[0].zohoMirror?.zohoInvoiceId).toBe('zinv-1');
  });

  it('sets zohoMirror to null when no mirror exists', async () => {
    invoiceFindMany.mockResolvedValue([makeRawInvoice('inv-2')]);
    invoiceCount.mockResolvedValue(1);
    zohoFindMany.mockResolvedValue([]);

    const result = await handler.execute({ page: 1, perPage: 20 });
    expect(result.items[0].zohoMirror).toBeNull();
  });

  it('flattens organization and subscription info', async () => {
    invoiceFindMany.mockResolvedValue([makeRawInvoice('inv-1')]);
    invoiceCount.mockResolvedValue(1);
    zohoFindMany.mockResolvedValue([]);

    const result = await handler.execute({ page: 1, perPage: 20 });
    expect(result.items[0].organization).toBeDefined();
    expect(result.items[0].subscriptionStatus).toBe('ACTIVE');
    expect(result.items[0]).not.toHaveProperty('subscription');
  });

  // ── zohoMirrored filter (in DB, not memory) ───────────────────────────────

  describe('zohoMirrored filter (in DB, not memory)', () => {
    it('pre-fetches mirrored IDs and passes id.in to findMany + count when zohoMirrored=yes', async () => {
      // zohoInvoiceLink pre-fetch returns 2 mirrored IDs
      zohoFindMany
        .mockResolvedValueOnce([
          { deqahInvoiceId: 'inv-1' },
          { deqahInvoiceId: 'inv-2' },
        ])
        // hydration call returns empty (no invoices from findMany)
        .mockResolvedValueOnce([]);

      await handler.execute({ page: 1, perPage: 20, zohoMirrored: 'yes' });

      // The pre-fetch call must ask for scope=SAAS_TENANT, deqahInvoiceId not null
      expect(zohoFindMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({ scope: 'SAAS_TENANT', deqahInvoiceId: { not: null } }),
        }),
      );

      // findMany and count must both have id.in filter with the resolved IDs
      expect(invoiceFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['inv-1', 'inv-2'] },
          }),
        }),
      );
      expect(invoiceCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['inv-1', 'inv-2'] },
          }),
        }),
      );
    });

    it('pre-fetches mirrored IDs and passes id.notIn to findMany + count when zohoMirrored=no', async () => {
      zohoFindMany
        .mockResolvedValueOnce([
          { deqahInvoiceId: 'inv-1' },
          { deqahInvoiceId: 'inv-2' },
        ])
        .mockResolvedValueOnce([]);

      await handler.execute({ page: 1, perPage: 20, zohoMirrored: 'no' });

      expect(invoiceFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { notIn: ['inv-1', 'inv-2'] },
          }),
        }),
      );
      expect(invoiceCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { notIn: ['inv-1', 'inv-2'] },
          }),
        }),
      );
    });

    it('omits id filter when zohoMirrored is undefined', async () => {
      await handler.execute({ page: 1, perPage: 20 });

      const findManyCall = invoiceFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(findManyCall.where).not.toHaveProperty('id');
      // zohoFindMany should only be called for hydration (after findMany returns empty), not pre-fetch
      // With no invoices returned, zohoFindMany is never called
      expect(zohoFindMany).not.toHaveBeenCalled();
    });

    it('meta.total reflects filtered count — agrees with items.length', async () => {
      // Pre-fetch returns 1 mirrored ID
      zohoFindMany
        .mockResolvedValueOnce([{ deqahInvoiceId: 'inv-1' }])
        // hydration call returns the mirror for that invoice
        .mockResolvedValueOnce([
          { deqahInvoiceId: 'inv-1', zohoInvoiceId: 'zinv-1', status: 'paid', invoiceUrl: null, pdfUrl: null, viewedAt: null, lastSentAt: null, createdAt: new Date() },
        ]);

      invoiceFindMany.mockResolvedValue([makeRawInvoice('inv-1')]);
      invoiceCount.mockResolvedValue(1); // count uses same filtered where

      const result = await handler.execute({ page: 1, perPage: 20, zohoMirrored: 'yes' });

      expect(result.meta.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].zohoMirror).not.toBeNull();
    });

    it('does not filter items in memory after the DB query', async () => {
      // 3 invoices returned from DB (after DB filter); none should be dropped in-memory
      const invoices = [makeRawInvoice('inv-1'), makeRawInvoice('inv-2'), makeRawInvoice('inv-3')];
      zohoFindMany
        .mockResolvedValueOnce([{ deqahInvoiceId: 'inv-1' }, { deqahInvoiceId: 'inv-2' }, { deqahInvoiceId: 'inv-3' }])
        .mockResolvedValueOnce([
          { deqahInvoiceId: 'inv-1', zohoInvoiceId: 'z1', status: 'paid', invoiceUrl: null, pdfUrl: null, viewedAt: null, lastSentAt: null, createdAt: new Date() },
          { deqahInvoiceId: 'inv-2', zohoInvoiceId: 'z2', status: 'paid', invoiceUrl: null, pdfUrl: null, viewedAt: null, lastSentAt: null, createdAt: new Date() },
          { deqahInvoiceId: 'inv-3', zohoInvoiceId: 'z3', status: 'paid', invoiceUrl: null, pdfUrl: null, viewedAt: null, lastSentAt: null, createdAt: new Date() },
        ]);

      invoiceFindMany.mockResolvedValue(invoices);
      invoiceCount.mockResolvedValue(3);

      const result = await handler.execute({ page: 1, perPage: 20, zohoMirrored: 'yes' });

      // All 3 items come through — no in-memory filtering
      expect(result.items).toHaveLength(3);
    });
  });
});
