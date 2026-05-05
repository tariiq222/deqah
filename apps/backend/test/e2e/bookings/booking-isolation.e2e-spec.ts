import { bootHarness, IsolationHarness } from '../../tenant-isolation/isolation-harness';

describe('SaaS-02d — bookings cluster isolation', () => {
  let h: IsolationHarness;

  beforeAll(async () => {
    h = await bootHarness();
  });

  afterAll(async () => {
    if (h) await h.close();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Booking — cross-org visibility
  // ─────────────────────────────────────────────────────────────────────────────

  it('booking created in org B is invisible from org A', async () => {
    const a = await h.createOrg(`bk-iso-booking-a-${Date.now()}`, 'منظمة حجوزات أ');
    const b = await h.createOrg(`bk-iso-booking-b-${Date.now()}`, 'منظمة حجوزات ب');

    const bookingB = await h.runAs({ organizationId: b.id }, () =>
      h.prisma.booking.create({
        data: {
          organizationId: b.id,
          branchId: 'branch-b',
          clientId: 'client-b',
          employeeId: 'emp-b',
          serviceId: 'svc-b',
          scheduledAt: new Date('2030-01-01T10:00:00Z'),
          endsAt: new Date('2030-01-01T11:00:00Z'),
          durationMins: 60,
          price: 100,
          currency: 'SAR',
          bookingNumber: 1,
        },
        select: { id: true },
      }),
    );

    let fromA: Awaited<ReturnType<typeof h.prisma.booking.findFirst>>;
    await h.runAs({ organizationId: a.id }, async () => {
      fromA = await h.prisma.booking.findFirst({ where: { id: bookingB.id } });
    });

    expect(fromA!).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. WaitlistEntry — cross-org visibility
  // ─────────────────────────────────────────────────────────────────────────────

  it('waitlist entry created in org B is invisible from org A', async () => {
    const a = await h.createOrg(`bk-iso-wl-a-${Date.now()}`, 'منظمة قائمة انتظار أ');
    const b = await h.createOrg(`bk-iso-wl-b-${Date.now()}`, 'منظمة قائمة انتظار ب');

    const entryB = await h.runAs({ organizationId: b.id }, () =>
      h.prisma.waitlistEntry.create({
        data: {
          organizationId: b.id,
          clientId: 'client-b',
          employeeId: 'emp-b',
          serviceId: 'svc-b',
          branchId: 'branch-b',
        },
        select: { id: true },
      }),
    );

    let fromA: Awaited<ReturnType<typeof h.prisma.waitlistEntry.findFirst>>;
    await h.runAs({ organizationId: a.id }, async () => {
      fromA = await h.prisma.waitlistEntry.findFirst({ where: { id: entryB.id } });
    });

    expect(fromA!).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. GroupSession — cross-org visibility
  // ─────────────────────────────────────────────────────────────────────────────

  it('group session created in org B is invisible from org A', async () => {
    const a = await h.createOrg(`bk-iso-gs-a-${Date.now()}`, 'منظمة جلسات جماعية أ');
    const b = await h.createOrg(`bk-iso-gs-b-${Date.now()}`, 'منظمة جلسات جماعية ب');

    const sessionB = await h.runAs({ organizationId: b.id }, () =>
      h.prisma.groupSession.create({
        data: {
          organizationId: b.id,
          branchId: 'branch-b',
          employeeId: 'emp-b',
          serviceId: 'svc-b',
          title: 'Group Session Org B',
          scheduledAt: new Date('2030-06-01T09:00:00Z'),
          durationMins: 60,
          maxCapacity: 10,
          price: 150,
          currency: 'SAR',
        },
        select: { id: true },
      }),
    );

    let fromA: Awaited<ReturnType<typeof h.prisma.groupSession.findFirst>>;
    await h.runAs({ organizationId: a.id }, async () => {
      fromA = await h.prisma.groupSession.findFirst({ where: { id: sessionB.id } });
    });

    expect(fromA!).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. BookingStatusLog — cross-org visibility
  // ─────────────────────────────────────────────────────────────────────────────

  it('booking status log created in org B is invisible from org A', async () => {
    const a = await h.createOrg(`bk-iso-bsl-a-${Date.now()}`, 'منظمة سجل الحالة أ');
    const b = await h.createOrg(`bk-iso-bsl-b-${Date.now()}`, 'منظمة سجل الحالة ب');

    // First seed a booking in org B to reference
    const bookingB = await h.runAs({ organizationId: b.id }, () =>
      h.prisma.booking.create({
        data: {
          organizationId: b.id,
          branchId: 'branch-b',
          clientId: 'client-b',
          employeeId: 'emp-b',
          serviceId: 'svc-b',
          scheduledAt: new Date('2030-02-01T10:00:00Z'),
          endsAt: new Date('2030-02-01T11:00:00Z'),
          durationMins: 60,
          price: 100,
          currency: 'SAR',
          bookingNumber: 1,
        },
        select: { id: true },
      }),
    );

    const logB = await h.runAs({ organizationId: b.id }, () =>
      h.prisma.bookingStatusLog.create({
        data: {
          organizationId: b.id,
          bookingId: bookingB.id,
          fromStatus: 'PENDING',
          toStatus: 'CONFIRMED',
          changedBy: 'admin-b',
        },
        select: { id: true },
      }),
    );

    let fromA: Awaited<ReturnType<typeof h.prisma.bookingStatusLog.findFirst>>;
    await h.runAs({ organizationId: a.id }, async () => {
      fromA = await h.prisma.bookingStatusLog.findFirst({ where: { id: logB.id } });
    });

    expect(fromA!).toBeNull();
  });
});
