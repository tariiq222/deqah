import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockApiRequest = vi.hoisted(() => vi.fn());

vi.mock('@deqah/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@deqah/api-client')>();
  return {
    ...actual,
    apiRequest: mockApiRequest,
    ApiError: actual.ApiError,
  };
});

describe('start-impersonation.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls adminRequest with POST and correct URL', async () => {
    const { startImpersonation } = await import('@/features/impersonation/start-impersonation/start-impersonation.api');
    mockApiRequest.mockResolvedValue({ sessionId: 'sess-1', shadowAccessToken: 'tok', expiresAt: '2025-01-01', redirectUrl: '/dashboard' });

    await startImpersonation({ organizationId: 'org-1', targetUserId: 'user-2' });

    expect(mockApiRequest).toHaveBeenCalledWith('/admin/impersonation', {
      method: 'POST',
      body: JSON.stringify({ organizationId: 'org-1', targetUserId: 'user-2' }),
    });
  });

  it('returns typed StartImpersonationResponse', async () => {
    const { startImpersonation } = await import('@/features/impersonation/start-impersonation/start-impersonation.api');
    const mockResponse = { sessionId: 'sess-x', shadowAccessToken: 'tok', expiresAt: '2025-06-01', redirectUrl: '/clinic' };
    mockApiRequest.mockResolvedValue(mockResponse);

    const result = await startImpersonation({ organizationId: 'o', targetUserId: 'u' });

    expect(result.sessionId).toBe('sess-x');
    expect(result.redirectUrl).toBe('/clinic');
  });
});
