import { bootHarness, IsolationHarness } from '../../tenant-isolation/isolation-harness';

/**
 * SaaS-02e §10.1 — Invoice cross-tenant isolation
 *
 * Verifies that invoices created in Org A are invisible from Org B
 * via both list and get operations.
 */
describe('SaaS-02e — invoice isolation', () => {
  let h: IsolationHarness;

  beforeAll(async () => {
    h = await bootHarness();
  });

  afterAll(async () => {
    if (h) await h.close();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Invoice created in Org A is invisible from Org B (findFirst by id)
  // ──────────────────────────────────────────────────────────────────────────

  it('invoice created in org A is invisible from org B via findFirst', async () => {
    const a = await h.createOrg(`inv-iso-a-${Date.now()}`, 'منظمة فاتورة أ');
    const b = await h.createOrg(`inv-iso-b-${Date.now()}`, 'منظمة فاتورة ب');

    // Seed a booking under Org A (raw — UUIDs ensure cross-org uniqueness)
    const bookingId = crypto.randomUUID();
    await h.runAs({ organizationId: a.id }, () =>
      h.prisma.booking.create({
        data: {
          id: bookingId,
          organizationId: a.id,
          branchId: 'branch-inv-a',
          clientId: 'client-inv-a',
          employeeId: 'emp-inv-a',
          serviceId: 'svc-inv-a',
          scheduledAt: new Date('2031-01-01T10:00:00Z'),
          endsAt: new Date('2031-01-01T11:00:00Z'),
          durationMins: 60,
          price: 200,
          currency: 'SAR',
          bookingNumber: 1,
        },
        select: { id: true },
      }),
    );

    const invA = await h.runAs({ organizationId: a.id }, () =>
      h.prisma.invoice.create({
        data: {
          organizationId: a.id,
          bookingId,
          branchId: 'branch-inv-a',
          clientId: 'client-inv-a',
          employeeId: 'emp-inv-a',
          subtotal: 200,
          discountAmt: 0,
          vatRate: 0.15,
          vatAmt: 30,
          total: 230,
          status: 'ISSUED',
          issuedAt: new Date(),
          currency: 'SAR',
        },
        select: { id: true },
      }),
    );

    let fromB: Awaited<ReturnType<typeof h.prisma.invoice.findFirst>>;
    await h.runAs({ organizationId: b.id }, async () => {
      fromB = await h.prisma.invoice.findFirst({ where: { id: invA.id } });
    });

    expect(fromB!).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. findMany by Org B returns no Org A invoices
  // ──────────────────────────────────────────────────────────────────────────

  it('list-invoices from org B returns no org A invoices', async () => {
    const a = await h.createOrg(`inv-iso-list-a-${Date.now()}`, 'منظمة قائمة أ');
    const b = await h.createOrg(`inv-iso-list-b-${Date.now()}`, 'منظمة قائمة ب');

    const bookingId = crypto.randomUUID();
    await h.runAs({ organizationId: a.id }, () =>
      h.prisma.booking.create({
        data: {
          id: bookingId,
          organizationId: a.id,
          branchId: 'branch-inv-list-a',
          clientId: 'client-inv-list-a',
          employeeId: 'emp-inv-list-a',
          serviceId: 'svc-inv-list-a',
          scheduledAt: new Date('2031-02-01T10:00:00Z'),
          endsAt: new Date('2031-02-01T11:00:00Z'),
          durationMins: 60,
          price: 150,
          currency: 'SAR',
          bookingNumber: 1,
        },
        select: { id: true },
      }),
    );

    await h.runAs({ organizationId: a.id }, () =>
      h.prisma.invoice.create({
        data: {
          organizationId: a.id,
          bookingId,
          branchId: 'branch-inv-list-a',
          clientId: 'client-inv-list-a',
          employeeId: 'emp-inv-list-a',
          subtotal: 150,
          discountAmt: 0,
          vatRate: 0.15,
          vatAmt: 22.5,
          total: 172.5,
          status: 'ISSUED',
          issuedAt: new Date(),
          currency: 'SAR',
        },
        select: { id: true },
      }),
    );

    let fromB: Awaited<ReturnType<typeof h.prisma.invoice.findMany>>;
    await h.runAs({ organizationId: b.id }, async () => {
      fromB = await h.prisma.invoice.findMany({ where: { clientId: 'client-inv-list-a' } });
    });

    expect(fromB!).toEqual([]);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Two orgs can have invoices for different bookings (no cross-contamination)
  // ──────────────────────────────────────────────────────────────────────────

  it('org A and org B invoices for their own bookings are isolated', async () => {
    const a = await h.createOrg(`inv-iso-both-a-${Date.now()}`, 'منظمة فاتورتان أ');
    const b = await h.createOrg(`inv-iso-both-b-${Date.now()}`, 'منظمة فاتورتان ب');

    const bookingIdA = crypto.randomUUID();
    const bookingIdB = crypto.randomUUID();

    await h.runAs({ organizationId: a.id }, () =>
      h.prisma.booking.create({
        data: {
          id: bookingIdA,
          organizationId: a.id,
          branchId: 'br-a',
          clientId: 'cli-a',
          employeeId: 'emp-a',
          serviceId: 'svc-a',
          scheduledAt: new Date('2031-03-01T10:00:00Z'),
          endsAt: new Date('2031-03-01T11:00:00Z'),
          durationMins: 60,
          price: 100,
          currency: 'SAR',
          bookingNumber: 1,
        },
        select: { id: true },
      }),
    );

    await h.runAs({ organizationId: b.id }, () =>
      h.prisma.booking.create({
        data: {
          id: bookingIdB,
          organizationId: b.id,
          branchId: 'br-b',
          clientId: 'cli-b',
          employeeId: 'emp-b',
          serviceId: 'svc-b',
          scheduledAt: new Date('2031-03-01T10:00:00Z'),
          endsAt: new Date('2031-03-01T11:00:00Z'),
          durationMins: 60,
          price: 100,
          currency: 'SAR',
          bookingNumber: 1,
        },
        select: { id: true },
      }),
    );

    const invA = await h.runAs({ organizationId: a.id }, () =>
      h.prisma.invoice.create({
        data: {
          organizationId: a.id,
          bookingId: bookingIdA,
          branchId: 'br-a',
          clientId: 'cli-a',
          employeeId: 'emp-a',
          subtotal: 100,
          discountAmt: 0,
          vatRate: 0.15,
          vatAmt: 15,
          total: 115,
          status: 'ISSUED',
          issuedAt: new Date(),
          currency: 'SAR',
        },
        select: { id: true, organizationId: true },
      }),
    );

    const invB = await h.runAs({ organizationId: b.id }, () =>
      h.prisma.invoice.create({
        data: {
          organizationId: b.id,
          bookingId: bookingIdB,
          branchId: 'br-b',
          clientId: 'cli-b',
          employeeId: 'emp-b',
          subtotal: 100,
          discountAmt: 0,
          vatRate: 0.15,
          vatAmt: 15,
          total: 115,
          status: 'ISSUED',
          issuedAt: new Date(),
          currency: 'SAR',
        },
        select: { id: true, organizationId: true },
      }),
    );

    expect(invA.organizationId).toBe(a.id);
    expect(invB.organizationId).toBe(b.id);
    expect(invA.id).not.toBe(invB.id);

    // Cross-visibility check
    let invAFromB: Awaited<ReturnType<typeof h.prisma.invoice.findFirst>>;
    await h.runAs({ organizationId: b.id }, async () => {
      invAFromB = await h.prisma.invoice.findFirst({ where: { id: invA.id } });
    });
    expect(invAFromB!).toBeNull();

    let invBFromA: Awaited<ReturnType<typeof h.prisma.invoice.findFirst>>;
    await h.runAs({ organizationId: a.id }, async () => {
      invBFromA = await h.prisma.invoice.findFirst({ where: { id: invB.id } });
    });
    expect(invBFromA!).toBeNull();
  });
});
