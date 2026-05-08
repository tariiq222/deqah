/**
 * Well-known tenant identifiers and error codes.
 * Values must match prisma/migrations/*_saas01_organization_membership seed.
 */
export const DEFAULT_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';
export const DEFAULT_ORGANIZATION_SLUG = 'default';

export const TENANT_CLS_KEY = 'tenant' as const;
export const SYSTEM_CONTEXT_CLS_KEY = 'systemContext' as const;
export const SUPER_ADMIN_CONTEXT_CLS_KEY = 'superAdminContext' as const;

/**
 * CLS key carrying the per-request Prisma TransactionClient. When set, the
 * PrismaService proxy reroutes every model accessor through this tx instead
 * of the pool — so the `app.current_org_id` GUC set on the tx connection is
 * visible to every query in the request, not just the first.
 */
export const REQUEST_TX_CLS_KEY = 'request_tx';

export const TENANT_ERROR_CODES = {
  RESOLUTION_FAILED: 'TENANT_RESOLUTION_FAILED',
  CROSS_TENANT_ACCESS: 'TENANT_CROSS_ACCESS',
  NOT_MEMBER: 'TENANT_NOT_MEMBER',
  ORG_SUSPENDED: 'TENANT_ORG_SUSPENDED',
} as const;

export type TenantEnforcementMode = 'off' | 'permissive' | 'strict';
