import api from './api';
import {
  clearCurrentOrgId,
  setCurrentOrgId,
} from './tenant';
import {
  getSecureItem,
  setSecureItem,
  deleteSecureItem,
} from '@/stores/secure-storage';
import { store } from '@/stores/store';
import { logout as logoutAction } from '@/stores/slices/auth-slice';
import type {
  LoginRequest,
  LoginWithOtpRequest,
  VerifyOtpRequest,
  AuthResponse,
  User,
} from '@/types/auth';
import type { ApiResponse } from '@/types/api';

export type RegisterPayload = { firstName: string; lastName: string; phone: string; email: string };
export type RegisterResponse = { userId: string; maskedPhone: string };

export type RequestLoginOtpPayload = { identifier: string };
export type RequestLoginOtpResponse = { maskedIdentifier: string };

export type VerifyOtpPayload = { identifier: string; code: string; purpose: 'register' | 'login' };
export type ActiveMembership = { id: string; organizationId: string; role: string };
export type VerifyOtpResponse = {
  tokens: { accessToken: string; refreshToken: string };
  activeMembership: ActiveMembership | null;
};

export const registerUser = (body: RegisterPayload) =>
  api.post<RegisterResponse>('/mobile/auth/register', body).then(r => r.data);

export const requestLoginOtp = (body: RequestLoginOtpPayload) =>
  api.post<RequestLoginOtpResponse>('/mobile/auth/request-login-otp', body).then(r => r.data);

export const verifyMobileOtp = async (body: VerifyOtpPayload): Promise<VerifyOtpResponse> => {
  const response = await api.post<VerifyOtpResponse>('/mobile/auth/verify-otp', body);
  const data = response.data;
  await setSecureItem('accessToken', data.tokens.accessToken);
  await setSecureItem('refreshToken', data.tokens.refreshToken);
  if (data.activeMembership) {
    await setCurrentOrgId(data.activeMembership.organizationId);
  }
  return data;
};

export const requestEmailVerification = () =>
  api.post<{ success: true }>('/mobile/auth/request-email-verification').then(r => r.data);

interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
}

/**
 * Accept either the legacy `{ success, data }` envelope or the current
 * bare `{ accessToken, refreshToken, user, expiresIn? }` backend shape.
 * Callers can continue to read `response.success` / `response.data` uniformly.
 */
function normalizeAuthResponse(raw: unknown): AuthResponse {
  const r = raw as Partial<AuthResponse> & {
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
    user?: User;
  };
  if (r && typeof r === 'object' && 'success' in r && 'data' in r && r.data) {
    return r as AuthResponse;
  }
  if (r && r.accessToken && r.refreshToken && r.user) {
    return {
      success: true,
      data: {
        accessToken: r.accessToken,
        refreshToken: r.refreshToken,
        expiresIn: r.expiresIn ?? 900,
        user: r.user,
      },
    };
  }
  return { success: false, data: undefined as never };
}

export const authService = {
  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await api.post<unknown>('/auth/login', data);
    const normalized = normalizeAuthResponse(response.data);
    if (normalized.success && normalized.data) {
      await persistTokens(normalized.data);
    }
    return normalized;
  },

  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await api.post<unknown>('/auth/register', data);
    const normalized = normalizeAuthResponse(response.data);
    if (normalized.success && normalized.data) {
      await persistTokens(normalized.data);
    }
    return normalized;
  },

  /** POST /auth/login/otp/send */
  async sendOtp(data: LoginWithOtpRequest): Promise<ApiResponse> {
    const response = await api.post<ApiResponse>(
      '/auth/login/otp/send',
      data,
    );
    return response.data;
  },

  /** POST /auth/login/otp/verify — field is "code" not "otp" */
  async verifyOtp(data: VerifyOtpRequest): Promise<AuthResponse> {
    const response = await api.post<unknown>(
      '/auth/login/otp/verify',
      data,
    );
    const normalized = normalizeAuthResponse(response.data);
    if (normalized.success && normalized.data) {
      await persistTokens(normalized.data);
    }
    return normalized;
  },

  /** Logout: call backend + clear storage + clear Redux */
  async logout(): Promise<void> {
    try {
      const refreshToken = await getSecureItem('refreshToken');
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken });
      }
    } catch {
      // Backend call may fail — still clear local state
    }
    await deleteSecureItem('accessToken');
    await deleteSecureItem('refreshToken');
    await clearCurrentOrgId();
    store.dispatch(logoutAction());
  },

  /** GET /auth/me */
  async getProfile(): Promise<ApiResponse<User>> {
    const response = await api.get<ApiResponse<User>>('/auth/me');
    return response.data;
  },

  /** POST /mobile/auth/request-email-verification — sends a verification link to the authenticated user's email. */
  async sendVerificationEmail(): Promise<ApiResponse> {
    const response = await api.post<ApiResponse>('/mobile/auth/request-email-verification');
    return response.data;
  },

  /** Hydrate: read tokens from storage for app restart */
  async getStoredTokens() {
    const accessToken = await getSecureItem('accessToken');
    const refreshToken = await getSecureItem('refreshToken');
    return { accessToken, refreshToken };
  },

  /**
   * POST /public/otp/request — send OTP for password reset.
   * Uses purpose CLIENT_PASSWORD_RESET so it cannot be confused with login OTPs.
   */
  async requestPasswordResetOtp(email: string): Promise<ApiResponse> {
    const response = await api.post<ApiResponse>('/public/otp/request', {
      channel: 'EMAIL',
      identifier: email,
      purpose: 'CLIENT_PASSWORD_RESET',
      // TODO: integrate react-native-hcaptcha post-launch for real widget
      hCaptchaToken: process.env['EXPO_PUBLIC_HCAPTCHA_TOKEN'] ?? 'dev-bypass',
    });
    return response.data;
  },

  /**
   * POST /public/otp/verify — verify the reset OTP, returns a short-lived sessionToken.
   */
  async verifyPasswordResetOtp(
    email: string,
    code: string,
  ): Promise<{ sessionToken: string }> {
    const response = await api.post<{ sessionToken: string }>(
      '/public/otp/verify',
      {
        channel: 'EMAIL',
        identifier: email,
        code,
        purpose: 'CLIENT_PASSWORD_RESET',
        // TODO: integrate react-native-hcaptcha post-launch for real widget
        hCaptchaToken: process.env['EXPO_PUBLIC_HCAPTCHA_TOKEN'] ?? 'dev-bypass',
      },
    );
    return response.data;
  },

  /**
   * POST /public/auth/reset-password — set the new password using the verified sessionToken.
   */
  async resetClientPassword(
    sessionToken: string,
    newPassword: string,
  ): Promise<ApiResponse> {
    const response = await api.post<ApiResponse>(
      '/public/auth/reset-password',
      {
        sessionToken,
        newPassword,
        // TODO: integrate react-native-hcaptcha post-launch for real widget
        hCaptchaToken: process.env['EXPO_PUBLIC_HCAPTCHA_TOKEN'] ?? 'dev-bypass',
      },
    );
    return response.data;
  },
};

async function persistTokens(data: NonNullable<AuthResponse['data']>) {
  await setSecureItem('accessToken', data.accessToken);
  await setSecureItem('refreshToken', data.refreshToken ?? '');
  if (data.user?.organizationId) {
    await setCurrentOrgId(data.user.organizationId);
  }
}
