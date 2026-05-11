import { Injectable } from '@nestjs/common';
import { AbilityBuilder, createMongoAbility, MongoAbility } from '@casl/ability';
import type {
  PermissionSubject,
  PermissionAction,
} from '@deqah/shared/constants';

export type AppAbility = MongoAbility;

/**
 * Built-in role → permission-rule map.
 *
 * Subjects come from `@deqah/shared/constants` (`PERMISSION_SUBJECTS`).
 * Actions come from `@deqah/shared/constants` (`PERMISSION_ACTIONS`),
 * with the additional CASL-only literal `'all'` reserved for SUPER_ADMIN.
 *
 * OWNER is the per-org top-level role (`MembershipRole.OWNER`). It carries
 * everything ADMIN does, PLUS exclusive control over `Billing`, `Plan`, and
 * `Subscription` — the three subjects that govern subscription state and
 * platform billing. ADMIN handles day-to-day clinic ops but cannot change
 * the plan, refund a platform invoice, or cancel the subscription.
 *
 * Super-admin platform access is gated by `User.isSuperAdmin` (boolean),
 * NOT by this map. The `SUPER_ADMIN` row here is a transitional fallback
 * for in-flight tokens that still carry the legacy `role` claim.
 */
type Rule = { action: PermissionAction | 'manage'; subject: PermissionSubject | 'all' };

const ADMIN_RULES: readonly Rule[] = [
  { action: 'manage', subject: 'User' },
  { action: 'manage', subject: 'Booking' },
  { action: 'manage', subject: 'Client' },
  { action: 'manage', subject: 'Employee' },
  { action: 'manage', subject: 'Invoice' },
  { action: 'manage', subject: 'Payment' },
  { action: 'manage', subject: 'Report' },
  { action: 'manage', subject: 'Setting' },
  { action: 'manage', subject: 'Department' },
  { action: 'manage', subject: 'Category' },
  { action: 'manage', subject: 'Service' },
  { action: 'manage', subject: 'Branch' },
  { action: 'manage', subject: 'Branding' },
  { action: 'manage', subject: 'Content' },
  { action: 'manage', subject: 'Integration' },
];

const BUILT_IN: Record<string, readonly Rule[]> = {
  SUPER_ADMIN: [{ action: 'manage', subject: 'all' }],
  // OWNER inherits everything ADMIN can do AND adds platform-billing
  // control: subscription state, plan changes, platform-invoice oversight.
  // ADMIN stays out of these three subjects so a clinic operator cannot
  // accidentally cancel or upgrade the subscription, refund a platform
  // invoice, or reassign the plan. OWNER is typically the founder /
  // financial decision maker; ADMIN is the day-to-day operations lead.
  OWNER: [
    ...ADMIN_RULES,
    { action: 'manage', subject: 'Billing' },
    { action: 'manage', subject: 'Plan' },
    { action: 'manage', subject: 'Subscription' },
  ],
  ADMIN: ADMIN_RULES,
  RECEPTIONIST: [
    { action: 'manage', subject: 'Booking' },
    { action: 'manage', subject: 'Client' },
    { action: 'read', subject: 'Employee' },
    { action: 'read', subject: 'Invoice' },
  ],
  ACCOUNTANT: [
    { action: 'manage', subject: 'Invoice' },
    { action: 'manage', subject: 'Payment' },
    { action: 'read', subject: 'Booking' },
    { action: 'read', subject: 'Report' },
  ],
  EMPLOYEE: [
    { action: 'read', subject: 'Booking' },
    { action: 'read', subject: 'Client' },
    { action: 'update', subject: 'Booking' },
  ],
  CLIENT: [
    { action: 'read', subject: 'Booking' },
    { action: 'create', subject: 'Booking' },
    { action: 'read', subject: 'Invoice' },
  ],
};

/**
 * Input shape for `buildForUser`.
 *
 * `membershipRole` is the canonical per-organization role (`Membership.role`)
 * and MUST be used for any tenant-scoped authz decision. It is propagated
 * from the JWT `membershipRole` claim onto `req.user` by `JwtStrategy`.
 *
 * `role` is the legacy global `User.role` enum. Phase A of DB-08 left it in
 * place during JWT-rotation rollout; new code MUST NOT branch on it for
 * tenant authz. We accept it here only so callers without a tenant context
 * (super-admin platform surfaces, /auth/me, /tenants/register) can still
 * resolve a role, and as a transitional fallback for in-flight pre-rollout
 * tokens that lack `membershipRole`.
 */
export interface AbilitySubjectUser {
  /** Per-org role from `Membership.role`. Authoritative for tenant authz. */
  membershipRole?: string | null;
  /** @deprecated legacy global User.role; kept for super-admin / pre-rollout-token fallback only. */
  role?: string | null;
  customRole: { permissions: Array<{ action: string; subject: string }> } | null;
}

@Injectable()
export class CaslAbilityFactory {
  buildForUser(user: AbilitySubjectUser): AppAbility {
    const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
    if (user.customRole) {
      for (const p of user.customRole.permissions) can(p.action, p.subject);
    } else {
      // Canonical role for tenant-scoped authz is `Membership.role`. The
      // legacy `User.role` is a transition-only fallback and must NOT be
      // trusted when a per-org role is available — see Role precedence in
      // apps/backend/CLAUDE.md.
      const effectiveRole = user.membershipRole ?? user.role ?? '';
      for (const p of BUILT_IN[effectiveRole] ?? []) can(p.action, p.subject);
    }
    return build();
  }
}
