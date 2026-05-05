/**
 * TASK-DB-03: FK enforcement tests — Class A (intra-bookings) + Class B (intra-finance).
 *
 * Verifies that the FK constraints added in TASK-DB-03 are enforced at the DB level.
 * Class A: GroupEnrollment.bookingId → Booking (CASCADE)
 *          Booking.groupSessionId → GroupSession (SET NULL)
 * Class B: RefundRequest.invoiceId → Invoice (RESTRICT)
 *          RefundRequest.paymentId → Payment (RESTRICT)
 * Class C: Invoice.bookingId, Rating.bookingId — DEFERRED → TASK-DB-13 (no FK asserted here).
 *
 * Tests also confirm tenant isolation still holds after FK additions.
 */
import { bootHarness, IsolationHarness } from '../../tenant-isolation/isolation-harness';

const FAKE_ID = '00000000-0000-0000-0000-000000000099';

describe('TASK-DB-03: intra-BC FK enforcement', () => {
  let h: IsolationHarness;

  beforeAll(async () => {
    h = await bootHarness();
  }, 60_000);

  afterAll(async () => {
    if (h) await h.close();
  });

  // ─── Class A: GroupEnrollment.bookingId → Booking (CASCADE) ────────────────

  it('Class A: GroupEnrollment with non-existent bookingId throws FK violation', async () => {
    const org = await h.createOrg(`db03-fk-a1-${Date.now()}`, 'Test Org A1');

    const gs = await h.runAs({ organizationId: org.id }, () =>
      h.prisma.groupSession.create({
        data: {
          organizationId: org.id,
          branchId: FAKE_ID,
          employeeId: FAKE_ID,
          serviceId: FAKE_ID,
          title: 'Test Group Session',
          scheduledAt: new Date(Date.now() + 86_400_000),
          durationMins: 60,
          maxCapacity: 5,
          price: 100,
        },
        select: { id: true },
      }),
    );

    await expect(
      h.runAs({ organizationId: org.id }, () =>
        h.prisma.groupEnrollment.create({
          data: {
            organizationId: org.id,
            groupSessionId: gs.id,
            clientId: FAKE_ID,
            bookingId: FAKE_ID, // no Booking row exists — must throw FK violation
          },
        }),
      ),
    ).rejects.toThrow(); // Prisma P2003 — FK constraint failed on bookingId

    // Cleanup
    await h.runAs({ organizationId: org.id }, () =>
      h.prisma.groupSession.delete({ where: { id: gs.id } }),
    );
    await h.cleanupOrg(org.id);
  });

  // ─── Class A: Booking.groupSessionId → GroupSession (SET NULL) ─────────────

  it('Class A: SET NULL — booking.groupSessionId is nulled when GroupSession is deleted', async () => {
    const org = await h.createOrg(`db03-fk-a2-${Date.now()}`, 'Test Org A2');

    const gs = await h.runAs({ organizationId: org.id }, () =>
      h.prisma.groupSession.create({
        data: {
          organizationId: org.id,
          branchId: FAKE_ID,
          employeeId: FAKE_ID,
          serviceId: FAKE_ID,
          title: 'Test GS for SET NULL',
          scheduledAt: new Date(Date.now() + 86_400_000),
          durationMins: 60,
          maxCapacity: 5,
          price: 100,
        },
        select: { id: true },
      }),
    );

    const booking = await h.runAs({ organizationId: org.id }, () =>
      h.prisma.booking.create({
        data: {
          organizationId: org.id,
          branchId: FAKE_ID,
          clientId: FAKE_ID,
          employeeId: FAKE_ID,
          serviceId: FAKE_ID,
          scheduledAt: new Date('2035-06-01T10:00:00Z'),
          endsAt: new Date('2035-06-01T11:00:00Z'),
          durationMins: 60,
          price: 100,
          groupSessionId: gs.id,
          bookingNumber: 1,
        },
        select: { id: true },
      }),
    );

    // Delete the GroupSession → booking.groupSessionId must become null (SET NULL)
    await h.runAs({ organizationId: org.id }, () =>
      h.prisma.groupSession.delete({ where: { id: gs.id } }),
    );

    const updated = await h.runAs({ organizationId: org.id }, () =>
      h.prisma.booking.findUniqueOrThrow({ where: { id: booking.id }, select: { groupSessionId: true } }),
    );

    expect(updated.groupSessionId).toBeNull();

    // Cleanup
    await h.runAs({ organizationId: org.id }, () =>
      h.prisma.booking.delete({ where: { id: booking.id } }),
    );
    await h.cleanupOrg(org.id);
  });

  // ─── Class A: CASCADE — GroupEnrollment deleted when Booking is deleted ─────

  it('Class A: CASCADE — GroupEnrollment is deleted when its Booking is deleted', async () => {
    const org = await h.createOrg(`db03-fk-a3-${Date.now()}`, 'Test Org A3');

    const gs = await h.runAs({ organizationId: org.id }, () =>
      h.prisma.groupSession.create({
        data: {
          organizationId: org.id,
          branchId: FAKE_ID,
          employeeId: FAKE_ID,
          serviceId: FAKE_ID,
          title: 'Test GS Cascade',
          scheduledAt: new Date(Date.now() + 86_400_000),
          durationMins: 60,
          maxCapacity: 5,
          price: 100,
        },
        select: { id: true },
      }),
    );

    const booking = await h.runAs({ organizationId: org.id }, () =>
      h.prisma.booking.create({
        data: {
          organizationId: org.id,
          branchId: FAKE_ID,
          clientId: FAKE_ID,
          employeeId: FAKE_ID,
          serviceId: FAKE_ID,
          scheduledAt: new Date('2035-07-01T10:00:00Z'),
          endsAt: new Date('2035-07-01T11:00:00Z'),
          durationMins: 60,
          price: 100,
          groupSessionId: gs.id,
          bookingNumber: 1,
        },
        select: { id: true },
      }),
    );

    const enrollment = await h.runAs({ organizationId: org.id }, () =>
      h.prisma.groupEnrollment.create({
        data: {
          organizationId: org.id,
          groupSessionId: gs.id,
          clientId: FAKE_ID,
          bookingId: booking.id,
        },
        select: { id: true },
      }),
    );

    // Delete the booking → enrollment must cascade-delete
    await h.runAs({ organizationId: org.id }, () =>
      h.prisma.booking.delete({ where: { id: booking.id } }),
    );

    const orphan = await h.runAs({ organizationId: org.id }, () =>
      h.prisma.groupEnrollment.findUnique({ where: { id: enrollment.id } }),
    );

    expect(orphan).toBeNull(); // CASCADE worked

    // Cleanup
    await h.runAs({ organizationId: org.id }, () =>
      h.prisma.groupSession.delete({ where: { id: gs.id } }),
    );
    await h.cleanupOrg(org.id);
  });

  // ─── Class B: RefundRequest.invoiceId → Invoice (RESTRICT) ─────────────────

  it('Class B: RefundRequest with non-existent invoiceId throws FK violation', async () => {
    const org = await h.createOrg(`db03-fk-b1-${Date.now()}`, 'Test Org B1');

    await expect(
      h.runAs({ organizationId: org.id }, () =>
        h.prisma.refundRequest.create({
          data: {
            organizationId: org.id,
            invoiceId: FAKE_ID, // no Invoice exists
            paymentId: FAKE_ID,
            clientId: FAKE_ID,
            amount: 100,
            status: 'PENDING_REVIEW',
          },
        }),
      ),
    ).rejects.toThrow(); // Prisma P2003 — FK constraint failed on invoiceId

    await h.cleanupOrg(org.id);
  });

  it('Class B: RefundRequest with non-existent paymentId throws FK violation', async () => {
    const org = await h.createOrg(`db03-fk-b2-${Date.now()}`, 'Test Org B2');

    // Create a real Invoice so invoiceId FK is satisfied
    const invoice = await h.runAs({ organizationId: org.id }, () =>
      h.prisma.invoice.create({
        data: {
          organizationId: org.id,
          branchId: FAKE_ID,
          clientId: FAKE_ID,
          employeeId: FAKE_ID,
          bookingId: `booking-${Date.now()}`, // plain string — Class C FK deferred
          subtotal: 100,
          discountAmt: 0,
          vatRate: 0.15,
          vatAmt: 15,
          total: 115,
          status: 'PAID',
          issuedAt: new Date(),
        },
        select: { id: true },
      }),
    );

    await expect(
      h.runAs({ organizationId: org.id }, () =>
        h.prisma.refundRequest.create({
          data: {
            organizationId: org.id,
            invoiceId: invoice.id,
            paymentId: FAKE_ID, // no Payment exists — must throw
            clientId: FAKE_ID,
            amount: 100,
            status: 'PENDING_REVIEW',
          },
        }),
      ),
    ).rejects.toThrow(); // Prisma P2003 — FK constraint failed on paymentId

    // Cleanup
    await h.runAs({ organizationId: org.id }, () =>
      h.prisma.invoice.delete({ where: { id: invoice.id } }),
    );
    await h.cleanupOrg(org.id);
  });

  it('Class B: RESTRICT — Invoice cannot be deleted when a RefundRequest references it', async () => {
    const org = await h.createOrg(`db03-fk-b3-${Date.now()}`, 'Test Org B3');

    const bookingId = `booking-restrict-${Date.now()}`;

    // Create Invoice + Payment
    const invoice = await h.runAs({ organizationId: org.id }, () =>
      h.prisma.invoice.create({
        data: {
          organizationId: org.id,
          branchId: FAKE_ID,
          clientId: FAKE_ID,
          employeeId: FAKE_ID,
          bookingId,
          subtotal: 200,
          discountAmt: 0,
          vatRate: 0.15,
          vatAmt: 30,
          total: 230,
          status: 'PAID',
          issuedAt: new Date(),
        },
        select: { id: true },
      }),
    );

    const payment = await h.runAs({ organizationId: org.id }, () =>
      h.prisma.payment.create({
        data: {
          organizationId: org.id,
          invoiceId: invoice.id,
          amount: 230,
          method: 'ONLINE_CARD',
          status: 'COMPLETED',
        },
        select: { id: true },
      }),
    );

    await h.runAs({ organizationId: org.id }, () =>
      h.prisma.refundRequest.create({
        data: {
          organizationId: org.id,
          invoiceId: invoice.id,
          paymentId: payment.id,
          clientId: FAKE_ID,
          amount: 230,
          status: 'PENDING_REVIEW',
        },
      }),
    );

    // Attempting to delete the Invoice while a RefundRequest references it must fail
    await expect(
      h.runAs({ organizationId: org.id }, () =>
        h.prisma.invoice.delete({ where: { id: invoice.id } }),
      ),
    ).rejects.toThrow(); // P2003 — RESTRICT prevents deletion

    // Cleanup: delete refundRequest → payment → invoice
    await h.runAs({ organizationId: org.id }, () =>
      h.prisma.refundRequest.deleteMany({ where: { invoiceId: invoice.id } }),
    );
    await h.runAs({ organizationId: org.id }, () =>
      h.prisma.payment.delete({ where: { id: payment.id } }),
    );
    await h.runAs({ organizationId: org.id }, () =>
      h.prisma.invoice.delete({ where: { id: invoice.id } }),
    );
    await h.cleanupOrg(org.id);
  });

  // ─── Class C: deferred — plain-string insert still succeeds ────────────────

  it('Class C (deferred): Invoice with non-existent bookingId still inserts (FK not yet added)', async () => {
    const org = await h.createOrg(`db03-fk-c1-${Date.now()}`, 'Test Org C1');

    // This should succeed — Class C FK is DEFERRED to TASK-DB-13
    const inv = await h.runAs({ organizationId: org.id }, () =>
      h.prisma.invoice.create({
        data: {
          organizationId: org.id,
          branchId: FAKE_ID,
          clientId: FAKE_ID,
          employeeId: FAKE_ID,
          bookingId: FAKE_ID, // no Booking row — but no FK constraint either
          subtotal: 50,
          discountAmt: 0,
          vatRate: 0.15,
          vatAmt: 7.5,
          total: 57.5,
          status: 'DRAFT',
        },
        select: { id: true },
      }),
    );

    // Cleanup
    await h.runAs({ organizationId: org.id }, () =>
      h.prisma.invoice.delete({ where: { id: inv.id } }),
    );
    await h.cleanupOrg(org.id);

    // If this test ever FAILS (throws), it means a Class C FK was accidentally
    // added — raise with owner and tighten the assertion per TASK-DB-13 plan.
  });

  // ─── Tenant isolation: FK additions do not break org scoping ───────────────

  it('Tenant isolation: GroupEnrollment scoping still works after FK addition', async () => {
    const orgA = await h.createOrg(`db03-iso-a-${Date.now()}`, 'Org A Isolation');
    const orgB = await h.createOrg(`db03-iso-b-${Date.now()}`, 'Org B Isolation');

    const gsA = await h.runAs({ organizationId: orgA.id }, () =>
      h.prisma.groupSession.create({
        data: {
          organizationId: orgA.id,
          branchId: FAKE_ID,
          employeeId: FAKE_ID,
          serviceId: FAKE_ID,
          title: 'GS Org A',
          scheduledAt: new Date(Date.now() + 86_400_000),
          durationMins: 60,
          maxCapacity: 5,
          price: 100,
        },
        select: { id: true },
      }),
    );

    // Org B cannot see Org A's GroupSession
    let fromB: Awaited<ReturnType<typeof h.prisma.groupSession.findFirst>>;
    await h.runAs({ organizationId: orgB.id }, async () => {
      fromB = await h.prisma.groupSession.findFirst({ where: { id: gsA.id } });
    });

    expect(fromB!).toBeNull();

    // Cleanup
    await h.runAs({ organizationId: orgA.id }, () =>
      h.prisma.groupSession.delete({ where: { id: gsA.id } }),
    );
    await h.cleanupOrg(orgA.id);
    await h.cleanupOrg(orgB.id);
  });
});
