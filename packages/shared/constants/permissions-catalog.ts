/**
 * Canonical permission catalog — single source of truth for CASL Subjects
 * and Actions used by the backend authorization guard, the
 * list-permissions handler (admin-UI role editor), and any frontend
 * `canDo(module, action)` checks.
 *
 * Naming rules:
 *  • Subjects are PascalCase singular nouns (matches `@casl/ability` convention
 *    and the existing `casl-ability.factory.ts` BUILT_IN map).
 *  • Actions are lowercase verbs from the CASL action vocabulary.
 *  • Order is alphabetical so future additions land deterministically.
 *
 * NOTE: The frontend's `flattenPermissions()` helper lower-cases subjects
 * when emitting `module:action` strings (e.g. `Booking` → `booking:read`).
 * Keep both halves of the contract (PascalCase here, lowercase on the wire)
 * in sync — never rename a subject without updating both ends.
 */

export const PERMISSION_SUBJECTS = [
  'Billing',
  'Booking',
  'Branch',
  'Branding',
  'Category',
  'Client',
  'Content',
  'Coupon',
  'Department',
  'Employee',
  'Integration',
  'Invoice',
  'Payment',
  'Plan',
  'Report',
  'Role',
  'Service',
  'Setting',
  'Subscription',
  'User',
] as const;

export type PermissionSubject = (typeof PERMISSION_SUBJECTS)[number];

export const PERMISSION_ACTIONS = [
  'manage',
  'create',
  'read',
  'update',
  'delete',
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

/** Convenience pair used by the role-editor UI. */
export interface PermissionDescriptor {
  subject: PermissionSubject;
  action: PermissionAction;
}
