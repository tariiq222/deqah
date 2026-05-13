/**
 * Auth API — Deqah Dashboard
 *
 * Thin wrapper over @deqah/api-client/authApi. The shared package owns
 * request shape, envelope unwrapping, and 401 retry logic; this file only
 * adds persist/clear localStorage helpers and dashboard-specific aliases.
 */

import { authApi } from "@deqah/api-client"
import type { AuthResponse, UserPayload, OrgSelectionResponse, OrgSelectionMembership } from "@deqah/api-client"
import { setAccessToken, getAccessToken } from "@/lib/api"

export type AuthUser = UserPayload
export type { AuthResponse, OrgSelectionResponse, OrgSelectionMembership }

const USER_KEY = "deqah_user"
const IMPERSONATION_KEY = "deqah_impersonation"

export async function login(
  identifier: string,
  password: string,
  organizationId?: string,
): Promise<AuthResponse | OrgSelectionResponse> {
  const data = await authApi.login({ email: identifier, password, hCaptchaToken: '', organizationId })
  if ('requires_org_selection' in data) {
    // Do not persist — no tokens issued yet.
    return data
  }
  persistAuth(data)
  return data
}

export async function requestDashboardOtp(identifier: string): Promise<{ success: boolean }> {
  const res = await fetch(`/api/proxy/auth/otp/request-dashboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ identifier }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { message?: string }).message ?? 'Failed to send OTP')
  }
  return res.json()
}

export async function verifyDashboardOtp(identifier: string, code: string): Promise<AuthResponse> {
  const res = await fetch(`/api/proxy/auth/otp/verify-dashboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ identifier, code }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { message?: string }).message ?? 'Invalid or expired code')
  }
  const data = (await res.json()) as AuthResponse
  persistAuth(data)
  return data
}

export interface RegisterTenantPayload {
  name: string
  email: string
  phone: string
  password: string
  businessNameAr: string
  businessNameEn?: string
}

export async function registerTenant(payload: RegisterTenantPayload): Promise<AuthResponse> {
  const res = await fetch(`/api/proxy/public/tenants/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { message?: string }).message ?? 'Registration failed')
  }
  const data = (await res.json()) as AuthResponse
  persistAuth(data)
  return data
}

export async function fetchMe(): Promise<AuthUser> {
  const data = await authApi.getMe()
  localStorage.setItem(USER_KEY, JSON.stringify(data))
  return data
}

export async function refreshToken(): Promise<AuthResponse> {
  const tokens = await authApi.refreshToken()
  setAccessToken(tokens.accessToken)
  const cached = getStoredUser()
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    user: cached as UserPayload,
  }
}

export async function logoutApi(): Promise<void> {
  try {
    await authApi.logout()
  } catch {
    // Ignore — clear local state regardless
  }
  clearAuth()
}

export function logout(): void {
  clearAuth()
}

export function acceptImpersonationToken(token: string): void {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(IMPERSONATION_KEY, "1")
  }
  setAccessToken(token)
}

export function clearImpersonationMarker(): void {
  if (typeof window === "undefined") return
  sessionStorage.removeItem(IMPERSONATION_KEY)
}

export function isImpersonating(): boolean {
  if (typeof window === "undefined") return false
  return sessionStorage.getItem(IMPERSONATION_KEY) === "1"
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await authApi.changePassword({ currentPassword, newPassword })
}

export async function requestStaffPasswordReset(email: string): Promise<void> {
  await authApi.requestStaffPasswordReset(email)
}

export async function performStaffPasswordReset(
  token: string,
  newPassword: string,
): Promise<void> {
  await authApi.performStaffPasswordReset(token, newPassword)
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function isAuthenticated(): boolean {
  return !!getAccessToken()
}

function persistAuth(data: AuthResponse): void {
  localStorage.setItem(USER_KEY, JSON.stringify(data.user))
  setAccessToken(data.accessToken)
}

function clearAuth(): void {
  localStorage.removeItem(USER_KEY)
  clearImpersonationMarker()
  setAccessToken(null)
}
