import { Injectable, Logger } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { FeatureKey } from '@deqah/shared/constants/feature-keys';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { UsageCounterService } from '../../../platform/billing/usage-counter/usage-counter.service';
import { EPOCH, startOfMonthUTC } from '../../../platform/billing/usage-counter/period.util';
import { QUANTITATIVE_KEYS } from '../../../platform/billing/get-usage/get-usage.handler';
import {
  SUPER_ADMIN_CONTEXT_CLS_KEY,
  TENANT_CLS_KEY,
} from '../../../../common/tenant/tenant.constants';

/**
 * Daily reconciliation handler.
 *
 * Scans every active/trialing organization and re-derives the ground-truth
 * value for each quantitative usage key from source tables. When the stored
 * counter drifts from truth the counter is corrected and the discrepancy is
 * logged at WARN so on-call can audit.
 *
 * Org list is fetched under SUPER_ADMIN_CONTEXT_CLS_KEY (required for
 * prisma.$allTenants). Each org's counter reads/writes run inside a
 * cls.run() that sets TENANT_CLS_KEY so the tenant-scoping extension
 * auto-scopes UsageCounter queries correctly.
 */
@Injectable()
export class ReconcileUsageCountersHandler {
  private readonly logger = new Logger(ReconcileUsageCountersHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly counters: UsageCounterService,
    private readonly cls: ClsService,
  ) {}

  async execute(): Promise<{ orgsScanned: number; rowsRepaired: number }> {
    // Outer cls.run sets SUPER_ADMIN_CONTEXT_CLS_KEY before any $allTenants
    // access. Without this the $allTenants getter throws ForbiddenException
    // when called outside a super-admin CLS context (production bug: cron
    // crashed nightly at the org-list query before the inner per-org run).
    return this.cls.run(async () => {
      this.cls.set(SUPER_ADMIN_CONTEXT_CLS_KEY, true);

      const orgs = await this.prisma.$allTenants.organization.findMany({
        where: { status: { in: ['TRIALING', 'ACTIVE'] } },
        select: { id: true },
      });

      let repaired = 0;

      for (const { id: orgId } of orgs) {
        // Inner cls.run gives each org its own isolated CLS context with a
        // tenant identity so the tenant-scoping extension allows UsageCounter
        // queries scoped to that org. nestjs-cls supports nested runs.
        const orgRepaired = await this.cls.run(async () => {
          this.cls.set(TENANT_CLS_KEY, {
            organizationId: orgId,
            membershipId: 'system',
            id: 'system',
            role: 'system',
            isSuperAdmin: false,
          });
          // Keep SUPER_ADMIN_CONTEXT_CLS_KEY set in the inner context too so
          // any downstream $allTenants call (defensive) does not throw.
          this.cls.set(SUPER_ADMIN_CONTEXT_CLS_KEY, true);
          this.logger.log(`systemContext: reconcile-usage-counters org=${orgId}`);

          let localRepaired = 0;

          for (const key of QUANTITATIVE_KEYS) {
            const period = key === FeatureKey.MONTHLY_BOOKINGS ? startOfMonthUTC() : EPOCH;

            try {
              const truth = await this.recomputeFromSource(orgId, key, period);
              const stored = await this.counters.read(orgId, key, period);

              if (stored !== truth) {
                await this.counters.upsertExact(orgId, key, period, truth);
                this.logger.warn(
                  { orgId, key, stored, truth },
                  'usage_counter_drift_repaired',
                );
                localRepaired++;
              }
            } catch (err: unknown) {
              this.logger.error({ err, orgId, key }, 'usage_counter_reconcile_error');
            }
          }

          return localRepaired;
        });

        repaired += orgRepaired;
      }

      this.logger.log(
        { orgsScanned: orgs.length, rowsRepaired: repaired },
        'usage_counter_reconcile_complete',
      );

      return { orgsScanned: orgs.length, rowsRepaired: repaired };
    });
  }

  private async recomputeFromSource(
    organizationId: string,
    key: FeatureKey,
    _period: Date,
  ): Promise<number> {
    switch (key) {
      case FeatureKey.BRANCHES:
        return this.prisma.branch.count({
          where: { organizationId, isActive: true },
        });
      case FeatureKey.EMPLOYEES:
        return this.prisma.employee.count({ where: { organizationId, isActive: true } });
      case FeatureKey.SERVICES:
        return this.prisma.service.count({
          where: { organizationId, isActive: true },
        });
      case FeatureKey.MONTHLY_BOOKINGS: {
        const startOfMonth = startOfMonthUTC();
        return this.prisma.booking.count({
          where: {
            organizationId,
            scheduledAt: { gte: startOfMonth },
            status: { not: BookingStatus.CANCELLED },
          },
        });
      }
      default:
        return 0;
    }
  }
}
