import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { BookingStatus } from "@prisma/client";
import { FeatureKey } from "@deqah/shared/constants/feature-keys";
import { FEATURE_CATALOG } from "@deqah/shared/constants/feature-catalog";
import { PrismaService } from "../../../infrastructure/database/prisma.service";
import { SubscriptionCacheService } from "./subscription-cache.service";
import { UsageCounterService } from "./usage-counter/usage-counter.service";
import { EPOCH, startOfMonthUTC } from "./usage-counter/period.util";
import { REQUIRE_FEATURE_KEY } from "./feature.decorator";
import { FEATURE_KEY_MAP } from "./feature-key-map";
import { FeatureNotEnabledException } from "./feature-not-enabled.exception";

interface CachedFeatures {
  features: Record<string, number | boolean>;
  planSlug: string;
  status: string;
  expiresAt: number;
}

interface AuthenticatedRequest {
  user?: { organizationId?: string };
}

@Injectable()
export class FeatureGuard implements CanActivate, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeatureGuard.name);
  /** Static so external listeners can invalidate without holding a reference to the guard instance. */
  private static readonly sharedCache = new Map<string, CachedFeatures>();
  private readonly cache = FeatureGuard.sharedCache;
  private readonly ttlMs = 60_000;
  /** Static to match sharedCache — one sweeper per process regardless of how many guard instances exist. */
  private static sweepInterval?: NodeJS.Timeout;

  /** Invalidate cached features for one organization. */
  static invalidate(organizationId: string): void {
    FeatureGuard.sharedCache.delete(organizationId);
  }

  /** Invalidate ALL cached entries (e.g. after a plan schema change). */
  static invalidateAll(): void {
    FeatureGuard.sharedCache.clear();
  }

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly cacheService: SubscriptionCacheService,
    private readonly counters: UsageCounterService,
  ) {}

  onModuleInit(): void {
    if (!FeatureGuard.sweepInterval) {
      FeatureGuard.sweepInterval = setInterval(() => this.sweep(), 5 * 60_000);
      FeatureGuard.sweepInterval.unref?.();
    }
  }

  onModuleDestroy(): void {
    if (FeatureGuard.sweepInterval) {
      clearInterval(FeatureGuard.sweepInterval);
      FeatureGuard.sweepInterval = undefined;
    }
  }

  private sweep(): void {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      this.logger.debug(`Swept ${removed} expired cache entries (size: ${this.cache.size})`);
    }
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const featureKey = this.reflector.get<FeatureKey>(
      REQUIRE_FEATURE_KEY,
      ctx.getHandler(),
    );

    // No metadata → permissive
    if (!featureKey) return true;

    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      // Guard is method-level via @RequireFeature; the class is always
      // protected by JwtGuard. If we get here without req.user it is a
      // programming error (e.g. a future contributor put @RequireFeature
      // on a @Public() route). Fail closed instead of silently reading a
      // CLS fallback tenant.
      throw new UnauthorizedException(
        "Authentication required for feature-gated route",
      );
    }

    const { features, planSlug, status } = await this.resolveFeatures(organizationId);

    // Suspended subscriptions are blocked before feature-key resolution.
    if (status === 'SUSPENDED') {
      throw new ForbiddenException('subscription_suspended');
    }

    const jsonKey = FEATURE_KEY_MAP[featureKey];
    const value = features[jsonKey];

    // On/off boolean flag
    if (typeof value === "boolean") {
      if (value === false) {
        throw new FeatureNotEnabledException(featureKey, planSlug);
      }
      return true;
    }

    // Quantitative flag (limit stored as number; -1 = unlimited)
    if (typeof value === "number") {
      if (value === -1) return true;
      const current = await this.currentUsage(featureKey, organizationId);
      if (current >= value) {
        throw new ForbiddenException(
          `Feature limit reached for '${featureKey}': ${current}/${value}`,
        );
      }
      return true;
    }

    // ── Default DENY for missing boolean keys (Phase 1 / Bug B3) ────────
    // We reach here when features[jsonKey] is undefined (key not in the
    // plan's seeded limits). Historically the guard fell through to
    // `return true`, silently exposing PRO/ENTERPRISE features on plans
    // that hadn't been seeded with the new key. For boolean-kind catalog
    // entries we now fail closed.
    //
    // Exceptions to fail-closed:
    //   • No subscription found at all (planSlug === "" + empty features
    //     map): keep the existing fail-open posture so unauthenticated
    //     fixtures and orgs without billing data are not blanket-blocked.
    //     Callers in production always have a Subscription via trial/seed.
    //   • Quantitative-kind keys missing from limits: keep permissive
    //     (legacy behavior) — seeds always include the maxX keys, so this
    //     branch is effectively dead code in production.
    //   • Unknown feature keys (not in FEATURE_CATALOG): treat as allow
    //     so a future caller writing @RequireFeature with a custom key
    //     does not silently crash.
    if (planSlug === "" && Object.keys(features).length === 0) {
      return true;
    }

    const catalogEntry = FEATURE_CATALOG[featureKey];
    if (catalogEntry && catalogEntry.kind === "boolean") {
      throw new FeatureNotEnabledException(featureKey, planSlug);
    }

    return true;
  }

  private async resolveFeatures(
    organizationId: string,
  ): Promise<{ features: Record<string, number | boolean>; planSlug: string; status: string }> {
    const cached = this.cache.get(organizationId);
    if (cached && cached.expiresAt > Date.now()) {
      return { features: cached.features, planSlug: cached.planSlug, status: cached.status };
    }

    const sub = await this.cacheService.get(organizationId);
    if (!sub) {
      // No subscription found — cache an empty shell so the TTL is respected.
      const emptyEntry: CachedFeatures = {
        features: {},
        planSlug: "",
        status: "",
        expiresAt: Date.now() + this.ttlMs,
      };
      this.cache.set(organizationId, emptyEntry);
      return { features: {}, planSlug: "", status: "" };
    }

    const entry: CachedFeatures = {
      features: sub.limits,
      planSlug: sub.planSlug,
      status: sub.status,
      expiresAt: Date.now() + this.ttlMs,
    };
    this.cache.set(organizationId, entry);
    return { features: entry.features, planSlug: entry.planSlug, status: entry.status };
  }

  /**
   * Returns the current usage for a quantitative feature key.
   *
   * Strategy:
   * 1. Read from materialized UsageCounter (fast, O(1) index lookup).
   * 2. If no row exists yet, fall back to recomputing from source tables
   *    and upsert the result (self-healing bootstrap).
   */
  private async currentUsage(
    key: FeatureKey,
    organizationId: string,
  ): Promise<number> {
    const period = key === FeatureKey.MONTHLY_BOOKINGS ? startOfMonthUTC() : EPOCH;

    const cached = await this.counters.read(organizationId, key, period);
    if (cached !== null) return cached;

    // Cache miss — recompute from source and write to counter (self-heal).
    const computed = await this.recomputeFromSource(key, organizationId, period);
    await this.counters.upsertExact(organizationId, key, period, computed);
    return computed;
  }

  /**
   * Recompute the ground-truth usage from the source tables.
   * Kept separate so the self-heal path and reconciliation cron can share it.
   */
  private async recomputeFromSource(
    key: FeatureKey,
    organizationId: string,
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
