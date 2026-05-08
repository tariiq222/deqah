import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FeatureKey } from '@deqah/shared/constants/feature-keys';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

/**
 * Thin data-access layer for UsageCounter rows.
 *
 * All methods rely on the caller establishing CLS tenant context.
 * In tenant request flow this is automatic via TenantResolverMiddleware.
 * In system flows (cron, event listeners), the caller must set TENANT_CLS_KEY
 * (preferred) or SYSTEM_CONTEXT_CLS_KEY inside a cls.run() before calling.
 *
 * The organizationId is always passed explicitly in the where clause —
 * defense-in-depth, idempotent with the auto-scoping extension.
 */
@Injectable()
export class UsageCounterService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atomically increment a counter by `by` (default 1).
   * Creates the row if it does not exist yet.
   *
   * Uses INSERT ... ON CONFLICT DO UPDATE so concurrent increments cannot
   * lose updates. The previous read-modify-write pattern under READ COMMITTED
   * silently undercounted — two parallel +1s could land as a single +1,
   * which is direct platform-revenue leak on overage-billed counters
   * (monthly_bookings, STORAGE_MB).
   *
   * GREATEST(0, …) keeps the counter non-negative when `by` is negative
   * (e.g. on refund decrement), preserving the previous Math.max(0, …) cap.
   */
  async increment(
    orgId: string,
    featureKey: FeatureKey,
    periodStart: Date,
    by = 1,
  ): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "UsageCounter" ("id", "organizationId", "featureKey", "periodStart", "value", "updatedAt")
      VALUES (gen_random_uuid(), ${orgId}::uuid, ${featureKey}, ${periodStart}, GREATEST(0, ${by}), NOW())
      ON CONFLICT ("organizationId", "featureKey", "periodStart")
      DO UPDATE SET
        "value" = GREATEST(0, "UsageCounter"."value" + ${by}),
        "updatedAt" = NOW()
    `);
  }

  /**
   * Overwrite the counter to an exact value (used by self-heal + reconciliation).
   */
  async upsertExact(
    orgId: string,
    featureKey: FeatureKey,
    periodStart: Date,
    value: number,
  ): Promise<void> {
    await this.prisma.usageCounter.upsert({
      where: {
        organizationId_featureKey_periodStart: {
          organizationId: orgId,
          featureKey,
          periodStart,
        },
      },
      update: { value },
      create: {
        organizationId: orgId,
        featureKey,
        periodStart,
        value,
      },
    });
  }

  /**
   * Read the current counter value. Returns null if no row exists yet.
   */
  async read(
    orgId: string,
    featureKey: FeatureKey,
    periodStart: Date,
  ): Promise<number | null> {
    const row = await this.prisma.usageCounter.findUnique({
      where: {
        organizationId_featureKey_periodStart: {
          organizationId: orgId,
          featureKey,
          periodStart,
        },
      },
      select: { value: true },
    });
    return row?.value ?? null;
  }
}
