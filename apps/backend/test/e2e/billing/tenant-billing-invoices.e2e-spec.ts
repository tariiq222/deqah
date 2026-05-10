import { NotFoundException } from '@nestjs/common';
import { bootHarness, IsolationHarness } from '../../tenant-isolation/isolation-harness';
import { IssueInvoiceHandler } from '../../../src/modules/platform/billing/issue-invoice/issue-invoice.handler';
import { ListInvoicesHandler } from '../../../src/modules/platform/billing/list-invoices/list-invoices.handler';
import { GetInvoiceHandler } from '../../../src/modules/platform/billing/get-invoice/get-invoice.handler';

/**
 * Phase 7 — tenant-isolation e2e for invoice listing, retrieval,
 * hash-chain integrity, and per-org numbering. `SubscriptionInvoice` is not
 * in `SCOPED_MODELS`; this spec is the canonical guard against any handler
 * regressing from explicit `organizationId` filtering.
 *
 * Note: the local PDF download endpoint was removed when Zoho became the
 * single invoicing system. Isolation for the GET /invoices/:id endpoint
 * is preserved below.
 */
describe('Phase 7 — tenant-billing-invoices', () => {
  let h: IsolationHarness;
  let issue: IssueInvoiceHandler;
  let list: ListInvoicesHandler;
  let get: GetInvoiceHandler;

  let orgA: string;
  let orgB: string;
  let planId: string;

  let invA1: string;
  let invA2: string;
  let invB1: string;

  beforeAll(async () => {
    process.env.MINIO_INVOICE_BUCKET ??= 'deqah-invoices';
    h = await bootHarness();
    issue = h.app.get(IssueInvoiceHandler);
    list = h.app.get(ListInvoicesHandler);
    get = h.app.get(GetInvoiceHandler);

    const ts = Date.now();
    const a = await h.createOrg(`p7-org-a-${ts}`, 'منظمة أ');
    const b = await h.createOrg(`p7-org-b-${ts}`, 'منظمة ب');
    orgA = a.id;
    orgB = b.id;

    const basic = await h.prisma.plan.findFirstOrThrow({ where: { slug: 'BASIC' } });
    planId = basic.id;

    const seedSubscriptionAndInvoice = async (organizationId: string) => {
      const sub = await h.prisma.subscription.create({
        data: {
          organizationId,
          planId,
          status: 'ACTIVE',
          billingCycle: 'MONTHLY',
          currentPeriodStart: new Date('2026-04-01T00:00:00.000Z'),
          currentPeriodEnd: new Date('2026-04-30T00:00:00.000Z'),
        },
        select: { id: true },
      });
      return sub.id;
    };

    const seedInvoice = async (
      subscriptionId: string,
      organizationId: string,
      monthOffset: number,
    ) => {
      const periodStart = new Date(Date.UTC(2026, 3 + monthOffset, 1));
      const periodEnd = new Date(Date.UTC(2026, 4 + monthOffset, 0));
      const row = await h.prisma.subscriptionInvoice.create({
        data: {
          subscriptionId,
          organizationId,
          amount: 115,
          flatAmount: 115,
          overageAmount: 0,
          lineItems: [
            { kind: 'FLAT_FEE', description: 'Subscription', amount: 115 },
          ],
          status: 'PAID',
          billingCycle: 'MONTHLY',
          periodStart,
          periodEnd,
          dueDate: periodStart,
        },
        select: { id: true },
      });
      return row.id;
    };

    const subA = await seedSubscriptionAndInvoice(orgA);
    const subB = await seedSubscriptionAndInvoice(orgB);

    invA1 = await seedInvoice(subA, orgA, 0);
    invB1 = await seedInvoice(subB, orgB, 0);
    invA2 = await seedInvoice(subA, orgA, 1);

    // Issue all three (sequential — important for the hash chain assertion).
    await issue.execute(invA1, new Date('2026-04-30T12:00:00.000Z'));
    await issue.execute(invB1, new Date('2026-04-30T12:00:01.000Z'));
    await issue.execute(invA2, new Date('2026-05-31T12:00:00.000Z'));
  }, 240_000);

  afterAll(async () => {
    if (h) {
      await h.prisma.subscriptionInvoice.deleteMany({
        where: { organizationId: { in: [orgA, orgB] } },
      });
      await h.prisma.subscription.deleteMany({
        where: { organizationId: { in: [orgA, orgB] } },
      });
      await h.prisma.organizationInvoiceCounter.deleteMany({
        where: { organizationId: { in: [orgA, orgB] } },
      });
      await h.cleanupOrg(orgA);
      await h.cleanupOrg(orgB);
      await h.close();
    }
  });

  it("list returns only the requesting org's invoices", async () => {
    const out = await h.runAs({ organizationId: orgA }, () => list.execute({ limit: 50 }));
    const ids = out.items.map(i => i.id).sort();
    expect(ids).toEqual([invA1, invA2].sort());
    expect(ids).not.toContain(invB1);
  });

  it("get returns 404 for another org's invoice", async () => {
    await expect(
      h.runAs({ organizationId: orgA }, () => get.execute(invB1)),
    ).rejects.toThrow(NotFoundException);
  });

  it("hash chain links org A's second invoice to its first", async () => {
    const a1 = await h.prisma.subscriptionInvoice.findUniqueOrThrow({
      where: { id: invA1 },
      select: { invoiceHash: true, previousHash: true },
    });
    const a2 = await h.prisma.subscriptionInvoice.findUniqueOrThrow({
      where: { id: invA2 },
      select: { previousHash: true },
    });
    expect(a1.previousHash).toBe('0');
    expect(a2.previousHash).toBe(a1.invoiceHash);
  });

  it('numbering sequences are independent per org', async () => {
    const a1 = await h.prisma.subscriptionInvoice.findUniqueOrThrow({
      where: { id: invA1 },
      select: { invoiceNumber: true },
    });
    const b1 = await h.prisma.subscriptionInvoice.findUniqueOrThrow({
      where: { id: invB1 },
      select: { invoiceNumber: true },
    });
    expect(a1.invoiceNumber).toMatch(/^INV-\d{4}-000001$/);
    expect(b1.invoiceNumber).toMatch(/^INV-\d{4}-000001$/);
  });

  it('re-issuing the same invoice is idempotent (no re-numbering, no re-hashing)', async () => {
    const before = await h.prisma.subscriptionInvoice.findUniqueOrThrow({
      where: { id: invA1 },
      select: { invoiceNumber: true, invoiceHash: true, status: true },
    });
    await issue.execute(invA1, new Date('2027-01-01T00:00:00.000Z'));
    const after = await h.prisma.subscriptionInvoice.findUniqueOrThrow({
      where: { id: invA1 },
      select: { invoiceNumber: true, invoiceHash: true, status: true },
    });
    expect(after).toEqual(before);
  });
});
