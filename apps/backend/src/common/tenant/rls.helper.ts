import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { TenantContextService } from './tenant-context.service';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Sets `app.current_org_id` (and optionally `app.bypass_rls`) on the current
 * transaction so RLS policies see the right tenant.
 *
 * The 2026-05-09 hardening migration tightened policies from
 *   "organizationId = app_current_org_id() OR app_current_org_id() IS NULL"
 * to
 *   "organizationId = app_current_org_id() OR app_rls_bypassed()"
 * so a missing GUC now fails CLOSED. Use `runWithoutTenant` for
 * super-admin / cron / webhook paths that legitimately need cross-tenant reach.
 */
@Injectable()
export class RlsHelper {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContextService,
  ) {}

  /**
   * Set app.current_org_id for the current transaction. No-op when the CLS
   * context has no tenant — callers that need a guaranteed tenant should call
   * `ctx.requireOrganizationId()` themselves before invoking this.
   *
   * Uses parameterized `set_config(...)` instead of `SET LOCAL` so the orgId
   * never reaches SQL via string interpolation.
   */
  async applyInTransaction(tx: Prisma.TransactionClient): Promise<void> {
    const orgId = this.ctx.getOrganizationId();
    if (!orgId) return;
    if (!UUID_RE.test(orgId)) {
      throw new Error(`RlsHelper: invalid orgId shape rejected before set_config`);
    }
    await tx.$queryRaw`SELECT set_config('app.current_org_id', ${orgId}, true)`;
  }

  /**
   * Run the given callback inside a transaction with `app.bypass_rls = 'on'`.
   * Use ONLY for super-admin / cron / webhook flows that legitimately need
   * cross-tenant reach. Every call must be greppable.
   */
  async runWithoutTenant<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.__bypassClient.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
      return fn(tx);
    });
  }
}
