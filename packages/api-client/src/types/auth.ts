// Canonical user payload returned by POST /auth/login and GET /auth/me.
// Fields here MUST match backend src/api/public/auth.controller.ts
// (loginEndpoint and meEndpoint shape after flattenPermissions).
export interface UserPayload {
  id: string
  email: string
  name: string
  // Derived from `name` by the backend (split on first whitespace run).
  // Optional only to tolerate legacy tokens that pre-date the SaaS-04
  // alignment; new responses always include them.
  firstName?: string
  lastName?: string
  phone: string | null
  gender: string | null
  avatarUrl: string | null
  isActive: boolean
  role: string
  customRoleId: string | null
  isSuperAdmin: boolean
  permissions: string[]
  // Resolved from the user's active Membership. Null when the user has
  // no active membership yet (e.g. freshly created super-admin in seeds).
  organizationId: string | null
  // Vertical slug of the active membership's organization (e.g. 'clinic',
  // 'salon'). Powers useTerminology() in dashboard/mobile without a second
  // round-trip. Null when the org has no vertical assigned yet.
  verticalSlug: string | null
  // ISO timestamp when the org's owner finished the onboarding wizard.
  // Null until completed; the dashboard layout uses it to redirect new
  // tenants to /onboarding.
  onboardingCompletedAt: string | null
  // Per-membership-profile: per-org display profile resolved from the
  // active Membership row. UIs should prefer activeMembership.{displayName,
  // jobTitle, avatarUrl} over the global User counterparts when present.
  activeMembership: {
    id: string
    organizationId: string
    role: string
    verticalSlug: string | null
    displayName: string | null
    jobTitle: string | null
    avatarUrl: string | null
  } | null
  // Sticky-org fallback: organizationId the user last operated under. Login
  // resolves to this when it still maps to an active membership.
  lastActiveOrganizationId?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface TokenPair {
  accessToken: string
  /** @deprecated CR-9: refresh token is now an httpOnly cookie (ck_refresh) and is no longer in the response body */
  refreshToken?: string
  expiresIn: number
}

export interface AuthResponse extends TokenPair {
  user: UserPayload
}

export interface ChangePasswordPayload {
  currentPassword: string
  newPassword: string
}
