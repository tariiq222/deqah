import { apiRequest } from '../client'
import type {
  AuthResponse,
  ChangePasswordPayload,
  TokenPair,
  UserPayload,
} from '../types/auth'

export interface LoginPayload {
  email: string
  password: string
  hCaptchaToken: string
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function refreshToken(): Promise<TokenPair> {
  // CR-9: refresh token is an httpOnly cookie (ck_refresh); credentials: 'include'
  // sends it automatically. No token in body.
  return apiRequest<TokenPair>('/auth/refresh', {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({}),
  })
}

export async function logout(): Promise<void> {
  return apiRequest<void>('/auth/logout', { method: 'POST' })
}

export async function getMe(): Promise<UserPayload> {
  return apiRequest<UserPayload>('/auth/me')
}

export async function changePassword(
  payload: ChangePasswordPayload,
): Promise<void> {
  return apiRequest<void>('/auth/password/change', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function requestStaffPasswordReset(email: string): Promise<void> {
  return apiRequest<void>('/auth/request-password-reset', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function performStaffPasswordReset(
  token: string,
  newPassword: string,
): Promise<void> {
  return apiRequest<void>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  })
}

export type { AuthResponse, ChangePasswordPayload, TokenPair, UserPayload }
