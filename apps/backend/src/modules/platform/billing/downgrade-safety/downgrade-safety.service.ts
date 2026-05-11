import { Injectable } from '@nestjs/common';
import { FeatureKey } from '@deqah/shared/constants/feature-keys';
import { BookingStatus, InvoiceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { UsageCounterService } from '../usage-counter/usage-counter.service';
import { EPOCH, startOfMonthUTC } from '../usage-counter/period.util';
import { FEATURE_KEY_MAP } from '../feature-key-map';

/**
 * Phase 2 / Bug B8 — Downgrade safety pre-check.
 *
 * Compares current organization usage against a candidate target plan's hard
 * caps (quantitative) AND checks boolean feature flags for in-flight data that
 * would be orphaned if the feature is removed by the downgrade.
 *
 * This is enforced at TWO points:
 *   1. At immediate-downgrade time (DowngradePlanHandler).
 *   2. At schedule-downgrade time, AND again when the cron picks up the
 *      scheduled change (process-scheduled-plan-changes.cron).
 */

export interface QuantitativeViolation {
  kind: 'QUANTITATIVE';
  featureKey: typeof FeatureKey.BRANCHES | typeof FeatureKey.EMPLOYEES | typeof FeatureKey.MONTHLY_BOOKINGS;
  current: number;
  targetMax: number;
}

export interface BooleanViolation {
  kind: 'BOOLEAN';
  featureKey: FeatureKey;
  blockingResources: {
    count: number;
    sampleIds: string[];
    deepLink: string;
  };
}

export type DowngradeViolation = QuantitativeViolation | BooleanViolation;

export interface DowngradeCheckResult {
  ok: boolean;
  violations: DowngradeViolation[];
}

interface PlanLimitsLike {
  maxBranches?: number;
  maxEmployees?: number;
  maxBookingsPerMonth?: number;
  [key: string]: unknown;
}

interface PlanLike {
  limits: Prisma.JsonValue | PlanLimitsLike;
}

/**
 * The hard-cap dimensions a downgrade can violate. `services` is excluded
 * intentionally: services are easy to deactivate, and the active count never
 * approaches the cap in practice.
 */
const HARD_CAP_DIMENSIONS: ReadonlyArray<{
  kind: QuantitativeViolation['featureKey'];
  jsonKey: keyof PlanLimitsLike;
}> = [
  { kind: FeatureKey.BRANCHES, jsonKey: 'maxBranches' },
  { kind: FeatureKey.EMPLOYEES, jsonKey: 'maxEmployees' },
  { kind: FeatureKey.MONTHLY_BOOKINGS, jsonKey: 'maxBookingsPerMonth' },
];

type BooleanCheck = (
  orgId: string,
  prisma: PrismaService,
) => Promise<{ count: number; sampleIds: string[]; deepLink: string } | null>;

const BOOLEAN_CHECKS: Partial<Record<FeatureKey, BooleanCheck>> = {
  [FeatureKey.RECURRING_BOOKINGS]: async (orgId, prisma) => {
    // Recurring bookings = future bookings with recurringGroupId set
    const rows = await prisma.booking.findMany({
      where: {
        organizationId: orgId,
        recurringGroupId: { not: null },
        scheduledAt: { gte: new Date() },
      },
      select: { id: true },
      take: 3,
    });
    if (rows.length === 0) return null;
    const total = await prisma.booking.count({
      where: {
        organizationId: orgId,
        recurringGroupId: { not: null },
        scheduledAt: { gte: new Date() },
      },
    });
    return { count: total, sampleIds: rows.map(r => r.id), deepLink: '/bookings?recurring=true' };
  },

  [FeatureKey.WAITLIST]: async (orgId, prisma) => {
    const rows = await prisma.waitlistEntry.findMany({
      where: { organizationId: orgId, status: 'WAITING' },
      select: { id: true },
      take: 3,
    });
    if (rows.length === 0) return null;
    const total = await prisma.waitlistEntry.count({
      where: { organizationId: orgId, status: 'WAITING' },
    });
    return { count: total, sampleIds: rows.map(r => r.id), deepLink: '/bookings/waitlist' };
  },

  [FeatureKey.GROUP_SESSIONS]: async (orgId, prisma) => {
    const rows = await prisma.groupSession.findMany({
      where: { organizationId: orgId, scheduledAt: { gte: new Date() } },
      select: { id: true },
      take: 3,
    });
    if (rows.length === 0) return null;
    const total = await prisma.groupSession.count({
      where: { organizationId: orgId, scheduledAt: { gte: new Date() } },
    });
    return { count: total, sampleIds: rows.map(r => r.id), deepLink: '/bookings/group' };
  },

  [FeatureKey.AI_CHATBOT]: async (orgId, prisma) => {
    const rows = await prisma.knowledgeDocument.findMany({
      where: { organizationId: orgId },
      select: { id: true },
      take: 3,
    });
    if (rows.length === 0) return null;
    const total = await prisma.knowledgeDocument.count({
      where: { organizationId: orgId },
    });
    return { count: total, sampleIds: rows.map(r => r.id), deepLink: '/chatbot/knowledge' };
  },

  [FeatureKey.EMAIL_TEMPLATES]: async (orgId, prisma) => {
    const rows = await prisma.emailTemplate.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true },
      take: 3,
    });
    if (rows.length === 0) return null;
    const total = await prisma.emailTemplate.count({
      where: { organizationId: orgId, isActive: true },
    });
    return { count: total, sampleIds: rows.map(r => r.id), deepLink: '/settings/email-templates' };
  },

  [FeatureKey.COUPONS]: async (orgId, prisma) => {
    const rows = await prisma.coupon.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      },
      select: { id: true },
      take: 3,
    });
    if (rows.length === 0) return null;
    const total = await prisma.coupon.count({
      where: {
        organizationId: orgId,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      },
    });
    return { count: total, sampleIds: rows.map(r => r.id), deepLink: '/coupons' };
  },

  [FeatureKey.INTAKE_FORMS]: async (orgId, prisma) => {
    const rows = await prisma.intakeForm.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true },
      take: 3,
    });
    if (rows.length === 0) return null;
    const total = await prisma.intakeForm.count({
      where: { organizationId: orgId, isActive: true },
    });
    return { count: total, sampleIds: rows.map(r => r.id), deepLink: '/settings/intake-forms' };
  },

  [FeatureKey.CUSTOM_ROLES]: async (orgId, prisma) => {
    const rows = await prisma.customRole.findMany({
      where: { organizationId: orgId },
      select: { id: true },
      take: 3,
    });
    if (rows.length === 0) return null;
    const total = await prisma.customRole.count({
      where: { organizationId: orgId },
    });
    return { count: total, sampleIds: rows.map(r => r.id), deepLink: '/settings/roles' };
  },

  [FeatureKey.ZOOM_INTEGRATION]: async (orgId, prisma) => {
    const integration = await prisma.integration.findFirst({
      where: { organizationId: orgId, provider: 'ZOOM', isActive: true },
      select: { id: true },
    });
    if (!integration) return null;
    return { count: 1, sampleIds: [integration.id], deepLink: '/settings/integrations/zoom' };
  },

  [FeatureKey.BANK_TRANSFER_PAYMENTS]: async (orgId, prisma) => {
    const rows = await prisma.payment.findMany({
      where: { organizationId: orgId, method: 'BANK_TRANSFER', status: 'PENDING' },
      select: { id: true },
      take: 3,
    });
    if (rows.length === 0) return null;
    const total = await prisma.payment.count({
      where: { organizationId: orgId, method: 'BANK_TRANSFER', status: 'PENDING' },
    });
    return { count: total, sampleIds: rows.map(r => r.id), deepLink: '/payments?method=bank' };
  },

  [FeatureKey.DEPARTMENTS]: async (orgId, prisma) => {
    const rows = await prisma.department.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true },
      take: 3,
    });
    if (rows.length === 0) return null;
    const total = await prisma.department.count({
      where: { organizationId: orgId, isActive: true },
    });
    return { count: total, sampleIds: rows.map(r => r.id), deepLink: '/departments' };
  },

  [FeatureKey.SMS_PROVIDER_PER_TENANT]: async (orgId, prisma) => {
    const config = await prisma.organizationSmsConfig.findFirst({
      where: { organizationId: orgId, NOT: { provider: 'NONE' } },
      select: { id: true },
    });
    if (!config) return null;
    return { count: 1, sampleIds: [config.id], deepLink: '/settings/sms' };
  },

  // MULTI_CURRENCY: check open invoices in non-SAR currency
  [FeatureKey.MULTI_CURRENCY]: async (orgId, prisma) => {
    const rows = await prisma.invoice.findMany({
      where: { organizationId: orgId, currency: { not: 'SAR' }, status: InvoiceStatus.ISSUED },
      select: { id: true },
      take: 3,
    });
    if (rows.length === 0) return null;
    const total = await prisma.invoice.count({
      where: { organizationId: orgId, currency: { not: 'SAR' }, status: InvoiceStatus.ISSUED },
    });
    return { count: total, sampleIds: rows.map(r => r.id), deepLink: '/payments' };
  },

  // CUSTOM_DOMAIN, API_ACCESS, WEBHOOKS, WHITE_LABEL_MOBILE — handled by grace policy in Phase 3 — no precheck violation
};

@Injectable()
export class DowngradeSafetyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly counters: UsageCounterService,
  ) {}

  /**
   * Check whether moving from `currentPlan` to `targetPlan` is safe given the
   * organization's present usage. `-1` on either side is treated as unlimited
   * and never triggers a violation.
   *
   * Reads materialized UsageCounter rows; if the row is missing (cold start),
   * falls back to a live count from the source-of-truth tables.
   * Also checks boolean features for in-flight data.
   */
  async checkDowngrade(
    currentPlan: PlanLike,
    targetPlan: PlanLike,
    organizationId: string,
  ): Promise<DowngradeCheckResult> {
    const targetLimits = readLimits(targetPlan);
    const currentLimits = readLimits(currentPlan);
    const violations: DowngradeViolation[] = [];

    for (const { kind, jsonKey } of HARD_CAP_DIMENSIONS) {
      const targetMax = readNumericLimit(targetLimits, jsonKey);
      if (targetMax < 0) continue; // unlimited target — never violates

      const current = await this.readCurrentUsage(kind, organizationId);
      if (current > targetMax) {
        violations.push({ kind: 'QUANTITATIVE', featureKey: kind, current, targetMax });
      }
    }

    const booleanViolations = await this.checkBooleanDowngrade(currentLimits, targetLimits, organizationId);
    violations.push(...booleanViolations);

    return { ok: violations.length === 0, violations };
  }

  async checkBooleanDowngrade(
    currentLimits: PlanLimitsLike,
    targetLimits: PlanLimitsLike,
    orgId: string,
  ): Promise<BooleanViolation[]> {
    const violations: BooleanViolation[] = [];
    for (const [key, check] of Object.entries(BOOLEAN_CHECKS) as Array<[FeatureKey, BooleanCheck]>) {
      const jsonKey = FEATURE_KEY_MAP[key];
      const wasOn = Boolean(currentLimits[jsonKey]);
      const isOff = !targetLimits[jsonKey];
      if (!wasOn || !isOff) continue;
      const result = await check(orgId, this.prisma);
      if (result) {
        violations.push({ kind: 'BOOLEAN', featureKey: key, blockingResources: result });
      }
    }
    return violations;
  }

  private async readCurrentUsage(
    kind: QuantitativeViolation['featureKey'],
    organizationId: string,
  ): Promise<number> {
    const period = kind === FeatureKey.MONTHLY_BOOKINGS ? startOfMonthUTC() : EPOCH;
    const cached = await this.counters.read(organizationId, kind, period);
    if (cached !== null) return cached;
    return this.recomputeFromSource(kind, organizationId);
  }

  private async recomputeFromSource(
    kind: QuantitativeViolation['featureKey'],
    organizationId: string,
  ): Promise<number> {
    switch (kind) {
      case FeatureKey.BRANCHES:
        // SAFE: platform admin service; $allTenants used intentionally for cross-org limit enforcement
        return this.prisma.$allTenants.branch.count({
          where: { organizationId, isActive: true },
        });
      case FeatureKey.EMPLOYEES:
        return this.prisma.$allTenants.employee.count({
          where: { organizationId, isActive: true },
        });
      case FeatureKey.MONTHLY_BOOKINGS: {
        const startOfMonth = startOfMonthUTC();
        return this.prisma.$allTenants.booking.count({
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

function readLimits(plan: PlanLike): PlanLimitsLike {
  const raw = plan.limits;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as PlanLimitsLike;
  }
  return {};
}

function readNumericLimit(limits: PlanLimitsLike, key: keyof PlanLimitsLike): number {
  const v = limits[key];
  return typeof v === 'number' ? v : -1;
}
