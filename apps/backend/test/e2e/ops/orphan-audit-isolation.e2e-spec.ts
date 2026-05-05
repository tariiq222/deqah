import { bootHarness, IsolationHarness } from '../../tenant-isolation/isolation-harness';
import { RunOrphanAuditHandler } from '../../../src/modules/ops/orphan-audit/run-orphan-audit.handler';
import { ActivityAction } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { SUPER_ADMIN_CONTEXT_CLS_KEY } from '../../../src/common/tenant/tenant.constants';

/**
 * DB-13 §E2E — Cross-tenant orphan audit isolation.
 *
 * Scenario:
 *   1. org-A has a Booking with a clientId that does not exist in Client table.
 *   2. org-B is clean (no orphans).
 *   3. RunOrphanAuditHandler.execute() runs.
 *   4. org-A's ActivityLog gains at least one 'orphan_audit' SYSTEM entry.
 *   5. org-B's ActivityLog has zero 'orphan_audit' entries.
 *   6. org-A cannot see org-B's ActivityLog (cross-tenant isolation via RLS).
 */
describe('DB-13 — orphan-audit isolation', () => {
  let h: IsolationHarness;
  let handler: RunOrphanAuditHandler;
  let cls: ClsService;

  beforeAll(async () => {
    h = await bootHarness();
    handler = h.app.get(RunOrphanAuditHandler);
    cls = h.app.get(ClsService);
  });

  afterAll(async () => {
    if (h) await h.close();
  });

  /**
   * Helper: create a Booking with deliberately fake cross-BC IDs so no
   * parent record exists in Client, Employee, Service, or Branch tables.
   */
  const createOrphanBooking = async (orgId: string, tag: string) => {
    const fakeClientId = `fake-client-${tag}`;
    // Use $allTenants to bypass RLS for test setup (runs in super-admin CLS ctx)
    await cls.run(async () => {
      cls.set(SUPER_ADMIN_CONTEXT_CLS_KEY, true);
      await h.prisma.$allTenants.booking.create({
        data: {
          organizationId: orgId,
          clientId: fakeClientId,
          employeeId: `fake-emp-${tag}`,
          serviceId: `fake-svc-${tag}`,
          branchId: `fake-branch-${tag}`,
          status: 'CONFIRMED',
          bookingType: 'INDIVIDUAL',
          scheduledAt: new Date(),
          endsAt: new Date(Date.now() + 3_600_000),
          durationMins: 60,
          price: 100,
          bookingNumber: 1,
        },
      });
    });
    return fakeClientId;
  };

  it('detects orphan in org-A and logs to ActivityLog without touching org-B', async () => {
    const ts = Date.now();
    const orgA = await h.createOrg(`orphan-a-${ts}`, 'منظمة أ');
    const orgB = await h.createOrg(`orphan-b-${ts}`, 'منظمة ب');

    const fakeClientId = await createOrphanBooking(orgA.id, `${ts}`);

    // Run the orphan audit across all orgs
    await handler.execute();

    // org-A should have at least one orphan_audit SYSTEM log (clientId is orphaned)
    let logsA: Array<{ organizationId: string; metadata: unknown }> = [];
    await cls.run(async () => {
      cls.set(SUPER_ADMIN_CONTEXT_CLS_KEY, true);
      logsA = await h.prisma.$allTenants.activityLog.findMany({
        where: {
          organizationId: orgA.id,
          action: ActivityAction.SYSTEM,
          entity: 'orphan_audit',
        },
        select: { organizationId: true, metadata: true },
      });
    });

    expect(logsA.length).toBeGreaterThanOrEqual(1);

    const clientOrphanLog = logsA.find(
      (l) =>
        typeof l.metadata === 'object' &&
        l.metadata !== null &&
        (l.metadata as Record<string, unknown>)['missingParentId'] === fakeClientId,
    );
    expect(clientOrphanLog).toBeDefined();
    expect(clientOrphanLog?.organizationId).toBe(orgA.id);

    // org-B should have zero orphan_audit entries
    let logsB: unknown[] = [];
    await cls.run(async () => {
      cls.set(SUPER_ADMIN_CONTEXT_CLS_KEY, true);
      logsB = await h.prisma.$allTenants.activityLog.findMany({
        where: {
          organizationId: orgB.id,
          action: ActivityAction.SYSTEM,
          entity: 'orphan_audit',
        },
      });
    });

    expect(logsB).toHaveLength(0);
  });

  it('does not expose org-A orphan log when querying as org-B (RLS)', async () => {
    const ts = Date.now();
    const orgA = await h.createOrg(`rls-a-${ts}`, 'ريليز أ');
    const orgB = await h.createOrg(`rls-b-${ts}`, 'ريليز ب');

    // Plant an orphan in org-A
    await createOrphanBooking(orgA.id, `rls-${ts}`);

    await handler.execute();

    // Query ActivityLog as org-B — RLS should return nothing from org-A
    let visibleFromB: Array<{ organizationId: string }> = [];
    await h.runAs({ organizationId: orgB.id }, async () => {
      visibleFromB = await h.prisma.activityLog.findMany({
        where: { action: ActivityAction.SYSTEM, entity: 'orphan_audit' },
        select: { organizationId: true },
      });
    });

    const leakedFromA = visibleFromB.filter((l) => l.organizationId === orgA.id);
    expect(leakedFromA).toHaveLength(0);
  });
});
