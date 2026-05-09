import { TenantContextService } from './tenant-context.service';
import { TenantEnforcementMode } from './tenant.constants';
import { UnauthorizedTenantAccessError } from './tenant.errors';

/**
 * Set of Prisma model names that carry `organizationId` and must be scoped.
 * Empty in Plan 01 — populated per-cluster in Plan 02 as each cluster's
 * schema gains the column. Until then the extension is a registered-but-no-op
 * hook: safe to mount, behavior-neutral.
 */
export type TenantScopedModelRegistry = Set<string>;

const SCOPED_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
]);

// NOTE: $transaction(async tx => ...) and $transaction([...]) bypass this extension —
// the `tx` client is raw Prisma, not the scoped proxy. Any update/delete inside a
// transaction MUST include `organizationId` explicitly in the where clause.
// See: https://www.prisma.io/docs/concepts/components/prisma-client/transactions

/**
 * The hook argument shape Prisma 7 passes to `$allOperations`. We don't import
 * `Prisma.Extension` from `@prisma/client` because Prisma 7's public type for
 * that symbol resolves to the _output_ of `defineExtension`, not the input —
 * unusable for factory functions like this one. Structural typing matches the
 * runtime shape 1:1.
 */
interface AllOperationsArgs {
  model?: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}

export interface TenantScopingExtension {
  name: string;
  query?: {
    $allModels: {
      $allOperations?: (args: AllOperationsArgs) => Promise<unknown>;
    };
  };
}

/**
 * Build a Prisma Client extension that auto-injects `organizationId` into
 * every `where` clause for registered models. Dormant when mode === 'off'.
 */
export function buildTenantScopingExtension(
  ctx: TenantContextService,
  mode: TenantEnforcementMode,
  scopedModels: TenantScopedModelRegistry,
): TenantScopingExtension {
  if (mode === 'off') {
    // No query hook — behavior-neutral.
    return { name: 'tenant-scoping:dormant' };
  }

  return {
    name: 'tenant-scoping:active',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !scopedModels.has(model)) return query(args);
          if (!SCOPED_OPERATIONS.has(operation)) return query(args);

          // External-entry bypass: payment-gateway webhooks, FCM DLQ, cron
          // triggered from outside the app arrive with no tenant. The
          // receiving handler opts in via `cls.set('systemContext', true)`
          // inside a `cls.run`, resolves the tenant from the payload, then
          // re-runs the rest of the work under a normal tenant context.
          if (ctx.isSystemContext()) return query(args);

          const current = ctx.get();
          // No tenant context: under `strict` we fail closed — a scoped-model
          // query without a resolved tenant is a programming error (handler
          // ran outside an authenticated request and outside `systemContext`).
          // Under `permissive` (dev only) we let it through to keep ad-hoc
          // scripts and migration bootstraps working.
          if (!current?.organizationId) {
            if (mode === 'strict') {
              throw new UnauthorizedTenantAccessError(
                `Refusing ${operation} on scoped model "${model}" — no tenant context resolved`,
              );
            }
            return query(args);
          }

          const existing = (args as { where?: Record<string, unknown> }).where ?? {};
          const scoped = { ...existing, organizationId: current.organizationId };
          return query({ ...(args as object), where: scoped });
        },
      },
    },
  };
}
