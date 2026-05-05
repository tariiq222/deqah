import { NotFoundException } from '@nestjs/common';
import { bootHarness, IsolationHarness } from '../../tenant-isolation/isolation-harness';
import { ApplyCouponHandler } from '../../../src/modules/finance/apply-coupon/apply-coupon.handler';

/**
 * SaaS-02e §10.3 — Coupon cross-tenant isolation (critical)
 *
 * 1. Same code "WELCOME10" can be created by two orgs (composite unique on org+code).
 *    Each org only sees its own coupon row.
 * 2. Applying Org A's coupon to an Org B invoice must fail (coupon not visible
 *    from Org B context → NotFoundException).
 */
describe('SaaS-02e — coupon isolation', () => {
  let h: IsolationHarness;

  beforeAll(async () => {
    h = await bootHarness();
  });

  afterAll(async () => {
    if (h) await h.close();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Same coupon code in two orgs — both inserts succeed, each org sees
  //    only its own row
  // ──────────────────────────────────────────────────────────────────────────

  it('same coupon code can exist in two orgs and each org sees only its own', async () => {
    const ts = Date.now();
    const a = await h.createOrg(`cpn-iso-a-${ts}`, 'منظمة كوبون أ');
    const b = await h.createOrg(`cpn-iso-b-${ts}`, 'منظمة كوبون ب');
    const code = `WELCOME-${ts}`;

    const couponA = await h.runAs({ organizationId: a.id }, () =>
      h.prisma.coupon.create({
        data: {
          organizationId: a.id,
          code,
          discountType: 'PERCENTAGE',
          discountValue: 10,
          isActive: true,
        },
        select: { id: true, organizationId: true, code: true },
      }),
    );

    const couponB = await h.runAs({ organizationId: b.id }, () =>
      h.prisma.coupon.create({
        data: {
          organizationId: b.id,
          code,
          discountType: 'PERCENTAGE',
          discountValue: 10,
          isActive: true,
        },
        select: { id: true, organizationId: true, code: true },
      }),
    );

    // Both inserts succeed with different IDs
    expect(couponA.id).not.toBe(couponB.id);
    expect(couponA.organizationId).toBe(a.id);
    expect(couponB.organizationId).toBe(b.id);
    expect(couponA.code).toBe(code);
    expect(couponB.code).toBe(code);

    // Org A can only see its own coupon by code
    let couponFromA: Awaited<ReturnType<typeof h.prisma.coupon.findFirst>>;
    await h.runAs({ organizationId: a.id }, async () => {
      couponFromA = await h.prisma.coupon.findFirst({ where: { code } });
    });
    expect(couponFromA!.id).toBe(couponA.id);
    expect(couponFromA!.organizationId).toBe(a.id);

    // Org B can only see its own coupon by code
    let couponFromB: Awaited<ReturnType<typeof h.prisma.coupon.findFirst>>;
    await h.runAs({ organizationId: b.id }, async () => {
      couponFromB = await h.prisma.coupon.findFirst({ where: { code } });
    });
    expect(couponFromB!.id).toBe(couponB.id);
    expect(couponFromB!.organizationId).toBe(b.id);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Applying Org A's coupon to an Org B invoice must fail
  //    The handler reads coupon by code under CLS context — from Org B the
  //    findFirst returns Org B's coupon (not Org A's), or if Org B has no
  //    such code, throws NotFoundException.
  // ──────────────────────────────────────────────────────────────────────────

  it("applying org A's coupon code to org B invoice fails (cross-org coupon redemption blocked)", async () => {
    const ts = Date.now();
    const a = await h.createOrg(`cpn-redeem-a-${ts}`, 'منظمة استرداد أ');
    const b = await h.createOrg(`cpn-redeem-b-${ts}`, 'منظمة استرداد ب');
    const codeA = `ONLY-IN-A-${ts}`;

    // Create coupon ONLY in Org A
    await h.runAs({ organizationId: a.id }, () =>
      h.prisma.coupon.create({
        data: {
          organizationId: a.id,
          code: codeA,
          discountType: 'FIXED',
          discountValue: 20,
          isActive: true,
        },
        select: { id: true },
      }),
    );

    // Seed invoice in Org B
    const bookingIdB = crypto.randomUUID();
    await h.runAs({ organizationId: b.id }, () =>
      h.prisma.booking.create({
        data: {
          id: bookingIdB,
          organizationId: b.id,
          branchId: 'br-cpn-b',
          clientId: 'cli-cpn-b',
          employeeId: 'emp-cpn-b',
          serviceId: 'svc-cpn-b',
          scheduledAt: new Date('2031-06-01T10:00:00Z'),
          endsAt: new Date('2031-06-01T11:00:00Z'),
          durationMins: 60,
          price: 200,
          currency: 'SAR',
          bookingNumber: 1,
        },
        select: { id: true },
      }),
    );

    const invoiceB = await h.runAs({ organizationId: b.id }, () =>
      h.prisma.invoice.create({
        data: {
          organizationId: b.id,
          bookingId: bookingIdB,
          branchId: 'br-cpn-b',
          clientId: 'cli-cpn-b',
          employeeId: 'emp-cpn-b',
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

    const applyCouponHandler = h.app.get(ApplyCouponHandler);

    // From Org B context, code `codeA` doesn't exist → NotFoundException
    await expect(
      h.runAs({ organizationId: b.id }, () =>
        applyCouponHandler.execute({
          invoiceId: invoiceB.id,
          code: codeA,
          clientId: 'cli-cpn-b',
        }),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Coupon created in org A is invisible from org B by id lookup
  // ──────────────────────────────────────────────────────────────────────────

  it('coupon created in org A is invisible from org B by id', async () => {
    const ts = Date.now();
    const a = await h.createOrg(`cpn-vis-a-${ts}`, 'منظمة كوبون رؤية أ');
    const b = await h.createOrg(`cpn-vis-b-${ts}`, 'منظمة كوبون رؤية ب');

    const couponA = await h.runAs({ organizationId: a.id }, () =>
      h.prisma.coupon.create({
        data: {
          organizationId: a.id,
          code: `HIDDEN-A-${ts}`,
          discountType: 'PERCENTAGE',
          discountValue: 5,
          isActive: true,
        },
        select: { id: true },
      }),
    );

    let fromB: Awaited<ReturnType<typeof h.prisma.coupon.findFirst>>;
    await h.runAs({ organizationId: b.id }, async () => {
      fromB = await h.prisma.coupon.findFirst({ where: { id: couponA.id } });
    });

    expect(fromB!).toBeNull();
  });
});
