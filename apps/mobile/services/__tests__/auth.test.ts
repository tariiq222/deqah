jest.mock('../api', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

const mockSetCurrentOrgId = jest.fn();
const mockClearCurrentOrgId = jest.fn();
jest.mock('../tenant', () => ({
  setCurrentOrgId: (...args: unknown[]) => mockSetCurrentOrgId(...args),
  clearCurrentOrgId: (...args: unknown[]) => mockClearCurrentOrgId(...args),
}));

const mockGetSecureItem = jest.fn();
const mockSetSecureItem = jest.fn();
const mockDeleteSecureItem = jest.fn();
jest.mock('@/stores/secure-storage', () => ({
  getSecureItem: (...a: unknown[]) => mockGetSecureItem(...a),
  setSecureItem: (...a: unknown[]) => mockSetSecureItem(...a),
  deleteSecureItem: (...a: unknown[]) => mockDeleteSecureItem(...a),
}));

const mockDispatch = jest.fn();
jest.mock('@/stores/store', () => ({ store: { dispatch: (...a: unknown[]) => mockDispatch(...a) } }));
jest.mock('@/stores/slices/auth-slice', () => ({ logout: jest.fn(() => ({ type: 'auth/logout' })) }));

import api from '../api';
import { authService } from '../auth';
import type { User } from '@/types/auth';

const mockedApi = api as unknown as { post: jest.Mock; get: jest.Mock };

const baseUser: User = {
  id: 'u1',
  email: 'a@b.c',
  name: 'A B',
  firstName: 'A',
  lastName: 'B',
  phone: null,
  gender: null,
  avatarUrl: null,
  isActive: true,
  role: 'CLIENT',
  customRoleId: null,
  isSuperAdmin: false,
  permissions: [],
  organizationId: 'org-1',
  verticalSlug: null,
  onboardingCompletedAt: null,
  activeMembership: null,
  emailVerified: true,
  createdAt: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('authService.login', () => {
  it('persists tokens + org id on bare backend response', async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: {
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        expiresIn: 1200,
        user: baseUser,
      },
    });

    const res = await authService.login({ email: 'a@b.c', password: 'p' });

    expect(res.success).toBe(true);
    expect(res.data?.accessToken).toBe('access-1');
    expect(mockSetSecureItem).toHaveBeenCalledWith('accessToken', 'access-1');
    expect(mockSetSecureItem).toHaveBeenCalledWith('refreshToken', 'refresh-1');
    expect(mockSetCurrentOrgId).toHaveBeenCalledWith('org-1');
  });

  it('passes through legacy { success, data } envelope', async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: { accessToken: 'a', refreshToken: 'r', expiresIn: 900, user: baseUser },
      },
    });
    const res = await authService.login({ email: 'a@b.c', password: 'p' });
    expect(res.success).toBe(true);
    expect(mockSetSecureItem).toHaveBeenCalled();
  });

  it('returns success:false when response is malformed', async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { foo: 'bar' } });
    const res = await authService.login({ email: 'a@b.c', password: 'p' });
    expect(res.success).toBe(false);
    expect(mockSetSecureItem).not.toHaveBeenCalled();
    expect(mockSetCurrentOrgId).not.toHaveBeenCalled();
  });

  it('propagates API errors (e.g. 401 invalid credentials)', async () => {
    mockedApi.post.mockRejectedValueOnce(new Error('Request failed with status code 401'));
    await expect(authService.login({ email: 'x', password: 'y' })).rejects.toThrow(/401/);
  });
});

describe('authService.register', () => {
  it('persists tokens on success', async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: { accessToken: 'a', refreshToken: 'r', user: baseUser },
    });
    const res = await authService.register({
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.c',
      password: 'pw',
    });
    expect(res.success).toBe(true);
    expect(mockSetSecureItem).toHaveBeenCalledTimes(2);
  });
});

describe('authService.sendOtp / verifyOtp', () => {
  it('sendOtp returns response payload as-is', async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { success: true } });
    const r = await authService.sendOtp({ email: 'a@b.c' });
    expect(r).toEqual({ success: true });
    expect(mockedApi.post).toHaveBeenCalledWith('/auth/login/otp/send', { email: 'a@b.c' });
  });

  it('verifyOtp persists tokens when valid', async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: { accessToken: 'a', refreshToken: 'r', user: baseUser },
    });
    const res = await authService.verifyOtp({ email: 'a@b.c', code: '1234' });
    expect(res.success).toBe(true);
    expect(mockSetSecureItem).toHaveBeenCalledWith('accessToken', 'a');
    expect(mockedApi.post).toHaveBeenCalledWith('/auth/login/otp/verify', {
      email: 'a@b.c',
      code: '1234',
    });
  });

  it('verifyOtp surfaces invalid-code errors (HTTP 400)', async () => {
    mockedApi.post.mockRejectedValueOnce(new Error('Invalid code'));
    await expect(
      authService.verifyOtp({ email: 'a@b.c', code: '0000' }),
    ).rejects.toThrow(/Invalid code/);
  });
});

describe('authService.logout', () => {
  it('hits /auth/logout, clears storage + org + redux', async () => {
    mockGetSecureItem.mockResolvedValueOnce('refresh-token-xyz');
    mockedApi.post.mockResolvedValueOnce({ data: {} });

    await authService.logout();

    expect(mockedApi.post).toHaveBeenCalledWith('/auth/logout', {
      refreshToken: 'refresh-token-xyz',
    });
    expect(mockDeleteSecureItem).toHaveBeenCalledWith('accessToken');
    expect(mockDeleteSecureItem).toHaveBeenCalledWith('refreshToken');
    expect(mockClearCurrentOrgId).toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalled();
  });

  it('still clears local state when backend logout call rejects', async () => {
    mockGetSecureItem.mockResolvedValueOnce('rt');
    mockedApi.post.mockRejectedValueOnce(new Error('500'));

    await authService.logout();

    expect(mockDeleteSecureItem).toHaveBeenCalledWith('accessToken');
    expect(mockClearCurrentOrgId).toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalled();
  });

  it('skips backend call when no refresh token is stored', async () => {
    mockGetSecureItem.mockResolvedValueOnce(null);

    await authService.logout();

    expect(mockedApi.post).not.toHaveBeenCalled();
    expect(mockDeleteSecureItem).toHaveBeenCalledWith('accessToken');
  });
});

describe('authService.getProfile / sendVerificationEmail / getStoredTokens', () => {
  it('getProfile returns api envelope', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { success: true, data: baseUser } });
    const r = await authService.getProfile();
    expect(r.success).toBe(true);
    expect(mockedApi.get).toHaveBeenCalledWith('/auth/me');
  });

  it('getProfile rejects on 401', async () => {
    mockedApi.get.mockRejectedValueOnce(new Error('401'));
    await expect(authService.getProfile()).rejects.toThrow(/401/);
  });

  it('sendVerificationEmail posts to the correct endpoint', async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { success: true } });
    await authService.sendVerificationEmail();
    expect(mockedApi.post).toHaveBeenCalledWith('/mobile/auth/request-email-verification');
  });

  it('getStoredTokens reads both tokens from secure storage', async () => {
    mockGetSecureItem.mockResolvedValueOnce('a-tok');
    mockGetSecureItem.mockResolvedValueOnce('r-tok');
    const tokens = await authService.getStoredTokens();
    expect(tokens).toEqual({ accessToken: 'a-tok', refreshToken: 'r-tok' });
  });
});
