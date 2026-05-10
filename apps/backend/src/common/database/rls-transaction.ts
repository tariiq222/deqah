import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { TENANT_CLS_KEY } from '../tenant/tenant.constants';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export class MissingRlsContextError extends Error {
  constructor() {
    super(
      'withRlsTransaction: no organizationId in CLS context and bypassRls was not set. ' +
        "Call withBypassTransaction() or pass { bypassRls: true } for super-admin/cron paths.",
    );
    this.name = 'MissingRlsContextError';
  }
}

export interface RlsTransactionOptions {
  /** Override the CLS-resolved organizationId for this single transaction. */
  organizationId?: string;
  /**
   * Skip RLS injection entirely. Use ONLY for super-admin / cron / webhook
   * flows that legitimately need cross-tenant access. Every call site that
   * passes this MUST include a comment explaining why.
   */
  bypassRls?: boolean;
  /** Prisma transaction timeout in ms. */
  timeout?: number;
  /** Prisma transaction maxWait in ms. */
  maxWait?: number;
  /** Postgres isolation level. */
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

/**
 * Wraps Prisma `$transaction` with automatic RLS context injection.
 *
 * Before calling `fn(tx)`, this helper runs:
 *   `SELECT set_config('app.current_org_id', <orgId>, true)`
 * inside the same transaction, so every scoped query inside `fn` is protected
 * by Postgres RLS policies that read `app.current_org_id()`.
 *
 * ### Tenant resolution order
 *   1. `options.organizationId` — explicit override
 *   2. CLS tenant context (`cls.get('tenant').organizationId`)
 *   3. If neither is present and `bypassRls` is false → throws MissingRlsContextError
 *
 * ### Bypass (super-admin / cron / webhook)
 *   Pass `{ bypassRls: true }` and add a comment explaining why. The helper
 *   will set `app.bypass_rls = 'on'` instead of `app.current_org_id`.
 *
 * @see RlsTransactionService — the injectable wrapper for this function.
 */
@Injectable()
export class RlsTransactionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  /**
   * Run `fn` inside a Prisma transaction with `app.current_org_id` set to the
   * current tenant's org id before any application query executes.
   *
   * Reads `organizationId` from CLS unless `options.organizationId` overrides it.
   * Throws `MissingRlsContextError` when no org id is available and bypassRls
   * is not set.
   */
  async withTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: RlsTransactionOptions,
  ): Promise<T> {
    const txOptions: Parameters<typeof this.prisma.$transaction>[1] = {};
    if (options?.timeout !== undefined) txOptions.timeout = options.timeout;
    if (options?.maxWait !== undefined) txOptions.maxWait = options.maxWait;
    if (options?.isolationLevel !== undefined) txOptions.isolationLevel = options.isolationLevel;

    return this.prisma.$transaction(async (tx) => {
      if (options?.bypassRls) {
        await tx.$queryRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
        return fn(tx);
      }

      const orgId =
        options?.organizationId ??
        (this.cls.get<{ organizationId?: string } | undefined>(TENANT_CLS_KEY))?.organizationId;

      if (!orgId) {
        throw new MissingRlsContextError();
      }
      if (!UUID_RE.test(orgId)) {
        throw new Error(
          `RlsTransactionService: invalid organizationId shape — rejected before set_config`,
        );
      }

      await tx.$queryRaw`SELECT set_config('app.current_org_id', ${orgId}, true)`;
      return fn(tx);
    }, txOptions);
  }

  /**
   * Convenience alias for cross-tenant contexts (super-admin, cron, webhook).
   * Sets `app.bypass_rls = 'on'` and runs `fn(tx)`.
   *
   * Every call site MUST include a comment explaining why tenant bypass is
   * legitimate — the ESLint guard on `$transaction` will surface any direct
   * usage that skips this service.
   */
  async withBypassTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: Pick<RlsTransactionOptions, 'timeout' | 'maxWait' | 'isolationLevel'>,
  ): Promise<T> {
    return this.withTransaction(fn, { ...options, bypassRls: true });
  }
}
