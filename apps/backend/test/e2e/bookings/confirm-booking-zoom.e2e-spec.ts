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
import { adminUser, createTestToken, ensureTestUsers } from '../../setup/auth.helper';
import { ZoomMeetingStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { ZoomCredentialsService } from '../../../src/infrastructure/zoom/zoom-credentials.service';

const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

describe('Confirm Booking Zoom (e2e)', () => {
  let req: SuperTest.Agent;
  let token: string;

  let clientId: string;
  let employeeId: string;
  let serviceId: string;
  let branchId: string;
  let originalFetch: typeof fetch;

  beforeAll(async () => {
    process.env.ZOOM_PROVIDER_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    ({ request: req } = await createTestApp());
    await ensureTestUsers();
    token = createTestToken(adminUser);

    await cleanTables([
      'BookingStatusLog',
      'Booking',
      'Integration',
      'Client',
      'Employee',
      'Service',
      'Branch',
      'EmployeeService',
    ]);

    const [client, employee, service, branch] = await Promise.all([
      seedClient(testPrisma as never),
      seedEmployee(testPrisma as never),
      seedService(testPrisma as never),
      seedBranch(testPrisma as never),
    ]);
    clientId = client.id;
    employeeId = employee.id;
    serviceId = service.id;
    branchId = branch.id;
    await seedEmployeeService(testPrisma as never, employeeId, serviceId);
    await seedEmployeeAvailability(testPrisma as never, employeeId);

    // Seed encrypted Zoom integration directly into DB.
    const creds = new ZoomCredentialsService({
      get: () => process.env.ZOOM_PROVIDER_ENCRYPTION_KEY,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as never);
    const ciphertext = creds.encrypt(
      { zoomClientId: 'cid', zoomClientSecret: 'csec', zoomAccountId: 'acct' },
      DEFAULT_ORG_ID,
    );
    await testPrisma.integration.create({
      data: {
        organizationId: DEFAULT_ORG_ID,
        provider: 'zoom',
        isActive: true,
        config: { ciphertext },
      },
    });
  });

  afterAll(async () => {
    if (originalFetch) global.fetch = originalFetch;
    await closeTestApp();
  });

  beforeEach(() => {
    if (!originalFetch) originalFetch = global.fetch;
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('Confirming ONLINE booking creates Zoom meeting (CREATED)', async () => {
    const booking = await testPrisma.booking.create({
      data: {
        organizationId: DEFAULT_ORG_ID,
        clientId,
        employeeId,
        branchId,
        serviceId,
        scheduledAt: new Date(Date.now() + 86400000),
        endsAt: new Date(Date.now() + 86400000 + 1800000),
        durationMins: 30,
        price: 100,
        bookingType: 'ONLINE',
        status: 'PENDING',
        bookingNumber: 9001,
      },
    });

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok', expires_in: 3600 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 12345,
          join_url: 'https://zoom.us/j/12345',
          start_url: 'https://zoom.us/s/12345',
        }),
      } as Response);

    const res = await req
      .patch(`/dashboard/bookings/${booking.id}/confirm`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    // The zoom meeting creation runs async after confirm-booking returns.
    // Allow the microtasks to flush.
    await new Promise((r) => setTimeout(r, 50));

    const updated = await testPrisma.booking.findUnique({
      where: { id: booking.id },
    });
    expect(updated?.zoomMeetingId).toBe('12345');
    expect(updated?.zoomMeetingStatus).toBe(ZoomMeetingStatus.CREATED);
    expect(updated?.zoomJoinUrl).toBe('https://zoom.us/j/12345');
    expect(updated?.zoomStartUrl).toBe('https://zoom.us/s/12345');
  });

  it('Confirming ONLINE booking with Zoom outage still confirms booking (FAILED status)', async () => {
    const booking = await testPrisma.booking.create({
      data: {
        organizationId: DEFAULT_ORG_ID,
        clientId,
        employeeId,
        branchId,
        serviceId,
        scheduledAt: new Date(Date.now() + 2 * 86400000),
        endsAt: new Date(Date.now() + 2 * 86400000 + 1800000),
        durationMins: 30,
        price: 100,
        bookingType: 'ONLINE',
        status: 'PENDING',
        bookingNumber: 9002,
      },
    });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Internal Server Error',
    } as Response);

    const res = await req
      .patch(`/dashboard/bookings/${booking.id}/confirm`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));

    const updated = await testPrisma.booking.findUnique({
      where: { id: booking.id },
    });
    expect(updated?.status).toBe('CONFIRMED');
    expect(updated?.zoomMeetingStatus).toBe(ZoomMeetingStatus.FAILED);
    expect(updated?.zoomMeetingError).toBeTruthy();
  });

  it('Re-confirming an already CREATED booking does NOT call Zoom API again (idempotency)', async () => {
    const booking = await testPrisma.booking.create({
      data: {
        organizationId: DEFAULT_ORG_ID,
        clientId,
        employeeId,
        branchId,
        serviceId,
        scheduledAt: new Date(Date.now() + 3 * 86400000),
        endsAt: new Date(Date.now() + 3 * 86400000 + 1800000),
        durationMins: 30,
        price: 100,
        bookingType: 'ONLINE',
        status: 'PENDING',
        zoomMeetingId: '99999',
        zoomMeetingStatus: ZoomMeetingStatus.CREATED,
        zoomJoinUrl: 'https://zoom.us/j/99999',
        zoomStartUrl: 'https://zoom.us/s/99999',
        bookingNumber: 9003,
      },
    });

    const res = await req
      .patch(`/dashboard/bookings/${booking.id}/confirm`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
