/**
 * Integration test: pg_advisory_xact_lock serializes concurrent
 * CreateZoomMeetingHandler calls and prevents duplicate Zoom meetings.
 *
 * Uses a real Postgres connection (deqah_test DB) via the isolation harness.
 * ZoomApiClient is replaced with a mock that has an artificial delay so the
 * race window is wide enough to be reliable.
 */

import { ClsService } from 'nestjs-cls';
import { bootHarness, IsolationHarness } from '../../tenant-isolation/isolation-harness';
import { CreateZoomMeetingHandler } from '../../../src/modules/bookings/create-zoom-meeting/create-zoom-meeting.handler';
import { ZoomApiClient } from '../../../src/infrastructure/zoom/zoom-api.client';
import { ZoomCredentialsService } from '../../../src/infrastructure/zoom/zoom-credentials.service';
import { FeatureCheckService } from '../../../src/modules/platform/billing/feature-check.service';
import { SUPER_ADMIN_CONTEXT_CLS_KEY } from '../../../src/common/tenant/tenant.constants';
import { ZoomMeetingStatus } from '@prisma/client';

const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

/** Helper: sleep for ms milliseconds */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('CreateZoomMeetingHandler — advisory lock race prevention', () => {
  let h: IsolationHarness;
  let cls: ClsService;

  // Shared fixture IDs
  let clientId: string;
  let employeeId: string;
  let serviceId: string;
  let branchId: string;

  // Tracking mock state
  let meetingCounter: number;
  let createMeetingCalls: string[]; // topics passed in
  let mockZoomApi: jest.Mocked<Pick<ZoomApiClient, 'getAccessToken' | 'createMeeting' | 'invalidateToken'>>;

  // Handler under test (with overridden ZoomApiClient and FeatureCheckService)
  let handler: CreateZoomMeetingHandler;

  // IDs of bookings created per test — cleaned up in afterEach
  const createdBookingIds: string[] = [];

  /** Wrap fn() in super-admin CLS so $allTenants is accessible */
  function runAsSuperAdmin<T>(fn: () => Promise<T>): Promise<T> {
    return cls.run(() => {
      cls.set(SUPER_ADMIN_CONTEXT_CLS_KEY, true);
      return fn();
    });
  }

  /** Wrap handler.execute() in CLS tenant context for strict-mode enforcement */
  function runAsOrgAdmin<T>(fn: () => Promise<T>): Promise<T> {
    return h.runAs({ organizationId: DEFAULT_ORG_ID, role: 'ADMIN' }, fn);
  }

  beforeAll(async () => {
    h = await bootHarness();
    cls = h.app.get(ClsService);

    const ts = Date.now();

    await runAsSuperAdmin(async () => {
      const client = await h.prisma.$allTenants.client.create({
        data: {
          organizationId: DEFAULT_ORG_ID,
          name: `Race Test Client ${ts}`,
          firstName: 'Race',
          lastName: 'Client',
          phone: `+96650${ts.toString().slice(-7)}`,
          isActive: true,
          source: 'WALK_IN',
        },
      });
      clientId = client.id;

      const employee = await h.prisma.$allTenants.employee.create({
        data: {
          organizationId: DEFAULT_ORG_ID,
          name: `Race Employee ${ts}`,
          isActive: true,
          employmentType: 'FULL_TIME',
        },
      });
      employeeId = employee.id;

      const service = await h.prisma.$allTenants.service.create({
        data: {
          organizationId: DEFAULT_ORG_ID,
          nameAr: `Race Service ${ts}`,
          durationMins: 60,
          price: 200,
          currency: 'SAR',
          isActive: true,
        },
      });
      serviceId = service.id;

      const branch = await h.prisma.$allTenants.branch.create({
        data: {
          organizationId: DEFAULT_ORG_ID,
          nameAr: `Race Branch ${ts}`,
          isActive: true,
        },
      });
      branchId = branch.id;

      // Seed OrganizationSettings (needed for timezone lookup inside handler)
      await h.prisma.$allTenants.organizationSettings.upsert({
        where: { organizationId: DEFAULT_ORG_ID },
        update: {},
        create: {
          organizationId: DEFAULT_ORG_ID,
          timezone: 'Asia/Riyadh',
        },
      });

      // Seed real encrypted Zoom Integration so handler can read it.
      const credsSvc = h.app.get(ZoomCredentialsService);
      const ciphertext = credsSvc.encrypt(
        { zoomClientId: 'cid', zoomClientSecret: 'csec', zoomAccountId: 'acct' },
        DEFAULT_ORG_ID,
      );
      await h.prisma.$allTenants.integration.upsert({
        where: { organizationId_provider: { organizationId: DEFAULT_ORG_ID, provider: 'zoom' } },
        update: { isActive: true, config: { ciphertext } },
        create: {
          organizationId: DEFAULT_ORG_ID,
          provider: 'zoom',
          isActive: true,
          config: { ciphertext },
        },
      });
    });
  });

  afterAll(async () => {
    // Clean up seeded prereqs
    try {
      await runAsSuperAdmin(async () => {
        await h.prisma.$allTenants.booking.deleteMany({
          where: { organizationId: DEFAULT_ORG_ID, employeeId },
        });
        await h.prisma.$allTenants.employee.delete({ where: { id: employeeId } });
        await h.prisma.$allTenants.client.delete({ where: { id: clientId } });
        await h.prisma.$allTenants.service.delete({ where: { id: serviceId } });
        await h.prisma.$allTenants.branch.delete({ where: { id: branchId } });
      });
    } catch {
      // best-effort cleanup — don't fail teardown
    }
    await h.close();
  });

  beforeEach(() => {
    meetingCounter = 0;
    createMeetingCalls = [];

    // Build the mock ZoomApiClient that counts calls and has an artificial delay
    mockZoomApi = {
      getAccessToken: jest.fn().mockResolvedValue('mock-token'),
      createMeeting: jest.fn().mockImplementation(async (_token, opts) => {
        // Wide race window — long enough that the second concurrent call
        // can reach the advisory lock acquisition before the first one commits.
        await sleep(300);
        const id = ++meetingCounter;
        createMeetingCalls.push(opts.topic as string);
        return {
          id,
          join_url: `https://zoom.us/j/${id}`,
          start_url: `https://zoom.us/s/${id}`,
        };
      }),
      invalidateToken: jest.fn(),
    };

    // Build a mock FeatureCheckService that always returns true
    const mockFeatureCheck: Pick<FeatureCheckService, 'isEnabled'> = {
      isEnabled: jest.fn().mockResolvedValue(true),
    };

    // Construct the handler directly — injecting the real PrismaService and
    // the mock ZoomApiClient + FeatureCheckService.
    handler = new CreateZoomMeetingHandler(
      h.prisma,
      mockZoomApi as unknown as ZoomApiClient,
      h.app.get(ZoomCredentialsService),
      mockFeatureCheck as unknown as FeatureCheckService,
    );
  });

  afterEach(async () => {
    // Clean up bookings created in this test
    if (createdBookingIds.length > 0) {
      await runAsSuperAdmin(() =>
        h.prisma.$allTenants.booking.deleteMany({
          where: { id: { in: [...createdBookingIds] } },
        }),
      );
      createdBookingIds.length = 0;
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Test 1: advisory lock serializes concurrent calls on the same booking
  // ────────────────────────────────────────────────────────────────────────────
  it('advisory lock serializes concurrent createZoomMeeting calls — Zoom API called exactly once', async () => {
    const booking = await runAsSuperAdmin(() =>
      h.prisma.$allTenants.booking.create({
        data: {
          organizationId: DEFAULT_ORG_ID,
          clientId,
          employeeId,
          branchId,
          serviceId,
          scheduledAt: new Date(Date.now() + 86_400_000),
          endsAt: new Date(Date.now() + 86_400_000 + 3_600_000),
          durationMins: 60,
          price: 200,
          currency: 'SAR',
          status: 'CONFIRMED',
          bookingType: 'ONLINE',
          zoomMeetingStatus: null,
          bookingNumber: Date.now(),
        },
      }),
    );
    createdBookingIds.push(booking.id);

    // Fire two concurrent executions on the same booking inside tenant context
    const [result1, result2] = await Promise.all([
      runAsOrgAdmin(() => handler.execute({ bookingId: booking.id })),
      runAsOrgAdmin(() => handler.execute({ bookingId: booking.id })),
    ]);

    // ── Core assertion: Zoom API called exactly once ──
    expect(mockZoomApi.createMeeting).toHaveBeenCalledTimes(1);

    // ── Both results must reflect the same meeting ──
    expect(result1.zoomMeetingStatus).toBe(ZoomMeetingStatus.CREATED);
    expect(result2.zoomMeetingStatus).toBe(ZoomMeetingStatus.CREATED);
    expect(result1.zoomMeetingId).toBe(result2.zoomMeetingId);
    expect(result1.zoomMeetingId).toBe('1'); // counter started at 0, first call increments to 1

    // ── Final DB state ──
    const final = await runAsSuperAdmin(() =>
      h.prisma.$allTenants.booking.findUniqueOrThrow({
        where: { id: booking.id },
      }),
    );
    expect(final.zoomMeetingId).toBe('1');
    expect(final.zoomMeetingStatus).toBe(ZoomMeetingStatus.CREATED);
    expect(final.zoomJoinUrl).toBe('https://zoom.us/j/1');
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Test 2: concurrent calls on different bookings do NOT block each other
  // ────────────────────────────────────────────────────────────────────────────
  it('concurrent calls on different bookings run in parallel (no cross-booking lock contention)', async () => {
    // createMeeting mock has 300ms delay (set in beforeEach).
    // If the two calls were serialized, elapsed would be ≥600ms.
    // Running in parallel → elapsed should be ~300ms (+overhead).

    const [bookingA, bookingB] = await runAsSuperAdmin(() =>
      Promise.all([
        h.prisma.$allTenants.booking.create({
          data: {
            organizationId: DEFAULT_ORG_ID,
            clientId,
            employeeId,
            branchId,
            serviceId,
            scheduledAt: new Date(Date.now() + 2 * 86_400_000),
            endsAt: new Date(Date.now() + 2 * 86_400_000 + 3_600_000),
            durationMins: 60,
            price: 200,
            currency: 'SAR',
            status: 'CONFIRMED',
            bookingType: 'ONLINE',
            zoomMeetingStatus: null,
            bookingNumber: Date.now() + 1,
          },
        }),
        h.prisma.$allTenants.booking.create({
          data: {
            organizationId: DEFAULT_ORG_ID,
            clientId,
            employeeId,
            branchId,
            serviceId,
            scheduledAt: new Date(Date.now() + 3 * 86_400_000),
            endsAt: new Date(Date.now() + 3 * 86_400_000 + 3_600_000),
            durationMins: 60,
            price: 200,
            currency: 'SAR',
            status: 'CONFIRMED',
            bookingType: 'ONLINE',
            zoomMeetingStatus: null,
            bookingNumber: Date.now() + 2,
          },
        }),
      ]),
    );
    createdBookingIds.push(bookingA.id, bookingB.id);

    // Override createMeeting to use a longer delay (500ms) for a more decisive timing margin
    (mockZoomApi.createMeeting as jest.Mock).mockImplementation(async (_token, opts) => {
      await sleep(500);
      const id = ++meetingCounter;
      createMeetingCalls.push(opts.topic as string);
      return {
        id,
        join_url: `https://zoom.us/j/${id}`,
        start_url: `https://zoom.us/s/${id}`,
      };
    });

    const start = Date.now();
    const [resA, resB] = await Promise.all([
      runAsOrgAdmin(() => handler.execute({ bookingId: bookingA.id })),
      runAsOrgAdmin(() => handler.execute({ bookingId: bookingB.id })),
    ]);
    const elapsed = Date.now() - start;

    // ── Both meetings must be CREATED ──
    expect(resA.zoomMeetingStatus).toBe(ZoomMeetingStatus.CREATED);
    expect(resB.zoomMeetingStatus).toBe(ZoomMeetingStatus.CREATED);

    // ── Different meetings ──
    expect(resA.zoomMeetingId).not.toBe(resB.zoomMeetingId);

    // ── Two distinct Zoom API calls ──
    expect(mockZoomApi.createMeeting).toHaveBeenCalledTimes(2);

    // ── Topics correspond to each booking ──
    expect(createMeetingCalls).toContain(`Booking ${bookingA.id}`);
    expect(createMeetingCalls).toContain(`Booking ${bookingB.id}`);

    // ── Elapsed < 800ms proves parallel execution ──
    // Serialized would be ≥1000ms (500ms + 500ms). Allow 800ms budget.
    expect(elapsed).toBeLessThan(800);
  });
});
