import SuperTest from 'supertest';
import { createTestApp, closeTestApp } from '../../setup/app.setup';
import { testPrisma, cleanTables } from '../../setup/db.setup';
import {
  seedClient,
  seedEmployee,
  seedService,
  seedBranch,
  seedEmployeeService,
  seedEmployeeAvailability,
} from '../../setup/seed.helper';
import { createTestToken, adminUser } from '../../setup/auth.helper';

const TEST_ORG_ID = '00000000-0000-0000-0000-000000000001';

/**
 * DB-02: Employee double-booking prevention.
 *
 * Tests the Postgres EXCLUDE constraint (btree_gist) that prevents two
 * PENDING/CONFIRMED bookings for the same employee with overlapping
 * [scheduledAt, endsAt) ranges.
 */
describe('Booking no-overlap constraint (DB-02)', () => {
  let req: SuperTest.Agent;
  let clientId: string;
  let employeeId: string;
  let serviceId: string;
  let branchId: string;
  let TOKEN: string;

  // Base slot: 24 hours from now, 60 minutes long
  const BASE_START = new Date(Date.now() + 24 * 60 * 60 * 1_000);
  const BASE_END = new Date(BASE_START.getTime() + 60 * 60 * 1_000);

  beforeAll(async () => {
    ({ request: req } = await createTestApp());
    TOKEN = createTestToken(adminUser);
    await cleanTables(['Booking', 'Invoice', 'Client', 'Employee', 'Service', 'Branch']);

    const [client, employee, service, branch] = await Promise.all([
      seedClient(testPrisma as never),
      seedEmployee(testPrisma as never),
      seedService(testPrisma as never, { durationMins: 60, price: 200 }),
      seedBranch(testPrisma as never),
    ]);
    clientId = client.id;
    employeeId = employee.id;
    serviceId = service.id;
    branchId = branch.id;
    await seedEmployeeService(testPrisma as never, employeeId, serviceId);
    await seedEmployeeAvailability(testPrisma as never, employeeId);
  });

  afterAll(async () => {
    await cleanTables(['Booking', 'Invoice', 'Client', 'Employee', 'Service', 'Branch']);
    await closeTestApp();
  });

  // ── Direct DB constraint tests ──────────────────────────────────────────────

  describe('Direct DB constraint', () => {
    afterEach(async () => {
      await (testPrisma as never as Record<string, { deleteMany: (args: unknown) => Promise<unknown> }>)['booking'].deleteMany({ where: { employeeId } });
    });

    it('allows two non-overlapping bookings for the same employee', async () => {
      const slotA_start = BASE_START;
      const slotA_end = BASE_END;
      const slotB_start = new Date(BASE_START.getTime() + 61 * 60 * 1_000); // starts 1 min after A ends
      const slotB_end = new Date(slotB_start.getTime() + 60 * 60 * 1_000);

      await (testPrisma as never as Record<string, { create: (args: unknown) => Promise<unknown> }>)['booking'].create({
          data: {
            organizationId: TEST_ORG_ID,
            branchId,
            clientId,
            employeeId,
            serviceId,
            scheduledAt: slotA_start,
            endsAt: slotA_end,
            durationMins: 60,
            price: 200,
            currency: 'SAR',
            status: 'CONFIRMED',
            bookingType: 'INDIVIDUAL',
          },
        });

      // Second booking must succeed (no overlap)
      await expect(
        (testPrisma as never as Record<string, { create: (args: unknown) => Promise<unknown> }>)['booking'].create({
            data: {
              organizationId: TEST_ORG_ID,
              branchId,
              clientId,
              employeeId,
              serviceId,
              scheduledAt: slotB_start,
              endsAt: slotB_end,
              durationMins: 60,
              price: 200,
              currency: 'SAR',
              status: 'CONFIRMED',
              bookingType: 'INDIVIDUAL',
            },
          }),
      ).resolves.toBeDefined();
    });

    it('rejects an overlapping CONFIRMED booking via direct DB insert (constraint fires)', async () => {
      // Insert the first booking via ORM (plain testPrisma bypasses the RLS proxy)
      await (testPrisma as never as Record<string, { create: (args: unknown) => Promise<unknown> }>)['booking'].create({
          data: {
            organizationId: TEST_ORG_ID,
            branchId,
            clientId,
            employeeId,
            serviceId,
            scheduledAt: BASE_START,
            endsAt: BASE_END,
            durationMins: 60,
            price: 200,
            currency: 'SAR',
            status: 'CONFIRMED',
            bookingType: 'INDIVIDUAL',
          },
        });

      // Attempt overlapping insert — must fail with exclusion constraint (23P01 → Prisma P2010)
      const overlapStart = new Date(BASE_START.getTime() + 30 * 60_000);
      const overlapEnd = new Date(BASE_END.getTime() + 30 * 60_000);

      await expect(
        (testPrisma as never as Record<string, { create: (args: unknown) => Promise<unknown> }>)['booking'].create({
            data: {
              organizationId: TEST_ORG_ID,
              branchId,
              clientId,
              employeeId,
              serviceId,
              scheduledAt: overlapStart,
              endsAt: overlapEnd,
              durationMins: 60,
              price: 200,
              currency: 'SAR',
              status: 'PENDING',
              bookingType: 'INDIVIDUAL',
            },
          }),
      ).rejects.toThrow();
    });

    it('allows overlapping bookings for GROUP type (constraint is partial)', async () => {
      // Group bookings with same slot must not trigger the constraint
      await (testPrisma as never as Record<string, { create: (args: unknown) => Promise<unknown> }>)['booking'].create({
          data: {
            organizationId: TEST_ORG_ID,
            branchId,
            clientId,
            employeeId,
            serviceId,
            scheduledAt: BASE_START,
            endsAt: BASE_END,
            durationMins: 60,
            price: 200,
            currency: 'SAR',
            status: 'CONFIRMED',
            bookingType: 'GROUP',
          },
        });

      // Same slot, same employee, GROUP — must succeed
      await expect(
        (testPrisma as never as Record<string, { create: (args: unknown) => Promise<unknown> }>)['booking'].create({
            data: {
              organizationId: TEST_ORG_ID,
              branchId,
              clientId,
              employeeId,
              serviceId,
              scheduledAt: BASE_START,
              endsAt: BASE_END,
              durationMins: 60,
              price: 200,
              currency: 'SAR',
              status: 'CONFIRMED',
              bookingType: 'GROUP',
            },
          }),
      ).resolves.toBeDefined();
    });

    it('allows a CANCELLED booking to coexist with a CONFIRMED booking in the same slot', async () => {
      await (testPrisma as never as Record<string, { create: (args: unknown) => Promise<unknown> }>)['booking'].create({
          data: {
            organizationId: TEST_ORG_ID,
            branchId,
            clientId,
            employeeId,
            serviceId,
            scheduledAt: BASE_START,
            endsAt: BASE_END,
            durationMins: 60,
            price: 200,
            currency: 'SAR',
            status: 'CONFIRMED',
            bookingType: 'INDIVIDUAL',
          },
        });

      await expect(
        (testPrisma as never as Record<string, { create: (args: unknown) => Promise<unknown> }>)['booking'].create({
            data: {
              organizationId: TEST_ORG_ID,
              branchId,
              clientId,
              employeeId,
              serviceId,
              scheduledAt: BASE_START,
              endsAt: BASE_END,
              durationMins: 60,
              price: 200,
              currency: 'SAR',
              status: 'CANCELLED',
              bookingType: 'INDIVIDUAL',
            },
          }),
      ).resolves.toBeDefined();
    });
  });

  // ── HTTP API tests ──────────────────────────────────────────────────────────

  describe('HTTP API — 409 on overlap', () => {
    // Use a different time slot so these tests don't share state with the DB tests above
    const API_START = new Date(Date.now() + 48 * 60 * 60 * 1_000);

    beforeEach(async () => {
      await (testPrisma as never as Record<string, { deleteMany: (args: unknown) => Promise<unknown> }>)['booking'].deleteMany({ where: { employeeId, scheduledAt: { gte: API_START } } });
    });

    afterEach(async () => {
      await (testPrisma as never as Record<string, { deleteMany: (args: unknown) => Promise<unknown> }>)['booking'].deleteMany({ where: { employeeId, scheduledAt: { gte: API_START } } });
    });

    it('returns 409 when a second booking overlaps a PENDING booking', async () => {
      // Create first booking
      const res1 = await req
        .post('/dashboard/bookings')
        .set('Authorization', `Bearer ${TOKEN}`)
        .send({
          clientId,
          employeeId,
          serviceId,
          branchId,
          scheduledAt: API_START.toISOString(),
          bookingType: 'INDIVIDUAL',
        });
      expect(res1.status).toBe(201);

      // Attempt an overlapping booking (starts 30 min into the first)
      const overlapStart = new Date(API_START.getTime() + 30 * 60_000).toISOString();
      const res2 = await req
        .post('/dashboard/bookings')
        .set('Authorization', `Bearer ${TOKEN}`)
        .send({
          clientId,
          employeeId,
          serviceId,
          branchId,
          scheduledAt: overlapStart,
          bookingType: 'INDIVIDUAL',
        });

      expect(res2.status).toBe(409);
      expect(res2.body.message).toMatch(/booking/i);
    });

    it('returns 409 when reschedule moves a booking onto an existing slot', async () => {
      // Slot A at 48h
      const res1 = await req
        .post('/dashboard/bookings')
        .set('Authorization', `Bearer ${TOKEN}`)
        .send({
          clientId,
          employeeId,
          serviceId,
          branchId,
          scheduledAt: API_START.toISOString(),
          bookingType: 'INDIVIDUAL',
        });
      expect(res1.status).toBe(201);

      // Slot B at 50h (no overlap)
      const slotB = new Date(API_START.getTime() + 2 * 60 * 60 * 1_000);
      const res2 = await req
        .post('/dashboard/bookings')
        .set('Authorization', `Bearer ${TOKEN}`)
        .send({
          clientId,
          employeeId,
          serviceId,
          branchId,
          scheduledAt: slotB.toISOString(),
          bookingType: 'INDIVIDUAL',
        });
      expect(res2.status).toBe(201);

      // Reschedule B onto A's slot → 409
      const res3 = await req
        .patch(`/dashboard/bookings/${res2.body.id as string}/reschedule`)
        .set('Authorization', `Bearer ${TOKEN}`)
        .send({ newScheduledAt: API_START.toISOString() });

      expect(res3.status).toBe(409);
    });
  });
});
