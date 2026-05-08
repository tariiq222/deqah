import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { DEFAULT_ORGANIZATION_ID, SYSTEM_CONTEXT_CLS_KEY, TENANT_CLS_KEY } from './tenant.constants';
import { UnauthorizedTenantAccessError } from './tenant.errors';

/**
 * Interface the billing module's `SubscriptionCacheService` satisfies. Declared
 * here (rather than importing the class directly) to keep the tenant layer
 * free of module-level imports from `src/modules/*`. The billing module wires
 * the concrete implementation via `SUBSCRIPTION_CACHE_TOKEN`.
 */
export interface SubscriptionCacheLookup {
  get(organizationId: string): Promise<{
    planSlug: string;
    status: string;
    limits: Record<string, number | boolean>;
  } | null>;
}

export const SUBSCRIPTION_CACHE_TOKEN = Symbol('TenantContext.SubscriptionCache');

export interface TenantContext {
  organizationId: string;
  membershipId: string;
  /**
   * User id. Named `id` (not `userId`) to match the shape
   * `JwtStrategy.validate()` already attaches to `req.user`.
   * Renaming would force a cascade rewrite of every guard and handler.
   */
  id: string;
  role: string;
  isSuperAdmin: boolean;
}

@Injectable()
export class TenantContextService {
  constructor(
    private readonly cls: ClsService,
    @Optional()
    @Inject(SUBSCRIPTION_CACHE_TOKEN)
    private readonly subscriptionCache?: SubscriptionCacheLookup,
    @Optional() private readonly config?: ConfigService,
  ) {}

  set(ctx: TenantContext): void {
    this.cls.set(TENANT_CLS_KEY, ctx);
  }

  get(): TenantContext | undefined {
    return this.cls.get<TenantContext | undefined>(TENANT_CLS_KEY);
  }

  getOrganizationId(): string | undefined {
    return this.get()?.organizationId;
  }

  getMembershipId(): string | undefined {
    return this.get()?.membershipId;
  }

  requireOrganizationId(): string {
    const id = this.getOrganizationId();
    if (!id) throw new UnauthorizedTenantAccessError();
    return id;
  }

  /**
   * Returns the current tenant's organizationId, or falls back to
   * DEFAULT_ORGANIZATION_ID when no context is set. Use this from handlers
   * that must keep working under `TENANT_ENFORCEMENT=off` (no middleware
   * populates CLS in that mode) while still writing/reading a concrete
   * organizationId. Never returns undefined.
   *
   * P1.2 hardening: under strict mode, returning the DEFAULT_ORGANIZATION_ID
   * would let any code path that "forgot" a tenant write rows to a phantom
   * org — a silent multi-tenant data corruption sink. Strict mode now throws,
   * matching the contract that every scoped query MUST have a resolved tenant.
   * off/permissive callers still get the default (dev-only convenience).
   */
  requireOrganizationIdOrDefault(): string {
    const id = this.getOrganizationId();
    if (id) return id;
    // P1.2 hardening: under strict mode, returning the DEFAULT_ORGANIZATION_ID
    // would let any code path that "forgot" a tenant write rows to a phantom
    // org — a silent multi-tenant data corruption sink. Strict mode now throws,
    // matching the contract that every scoped query MUST have a resolved tenant.
    // off/permissive callers still get the default (dev-only convenience).
    const mode = this.config?.get<string>('TENANT_ENFORCEMENT', 'strict') ?? 'strict';
    if (mode === 'strict') {
      throw new UnauthorizedTenantAccessError(
        'requireOrganizationIdOrDefault() called without a tenant under strict mode — handler must run inside an authenticated request or an explicit cls.run with the resolved org',
      );
    }
    return DEFAULT_ORGANIZATION_ID;
  }

  isSuperAdmin(): boolean {
    return this.get()?.isSuperAdmin === true;
  }

  /**
   * Mark the current async-local context as "system" — scoped queries are NOT
   * auto-filtered by organizationId. Use ONLY for external-entry flows (payment
   * gateway webhooks, FCM DLQ, cron jobs) that arrive without a tenant and need
   * to look up the tenant from the payload. After resolving the org, re-run the
   * rest of the work inside a normal cls.run with the resolved organizationId.
   *
   * Never call this from a handler invoked by an authenticated user.
   */
  isSystemContext(): boolean {
    return this.cls.get<boolean | undefined>(SYSTEM_CONTEXT_CLS_KEY) === true;
  }

  clear(): void {
    this.cls.set(TENANT_CLS_KEY, undefined);
  }

  /**
   * Returns the current tenant's cached plan limits (SaaS-04). Returns null
   * when no subscription exists for the org yet (pre-signup, fresh seed data)
   * OR when the billing module hasn't wired the cache (early-boot / tests
   * that don't load BillingModule). Callers must treat null as "no limits
   * known — permit by default" so the billing rollout is additive.
   */
  async currentPlanLimits(): Promise<{
    planSlug: string;
    status: string;
    limits: Record<string, number | boolean>;
  } | null> {
    if (!this.subscriptionCache) return null;
    return this.subscriptionCache.get(this.requireOrganizationIdOrDefault());
  }
}
