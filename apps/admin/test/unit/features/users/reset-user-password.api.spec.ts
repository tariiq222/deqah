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

describe('reset-user-password.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls adminRequest with POST and correct URL', async () => {
    const { resetUserPassword } = await import('@/features/users/reset-user-password/reset-user-password.api');
    mockApiRequest.mockResolvedValue(undefined);

    await resetUserPassword({ userId: 'user-33' });

    expect(mockApiRequest).toHaveBeenCalledWith('/admin/users/user-33/reset-password', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  });

  it('returns void', async () => {
    const { resetUserPassword } = await import('@/features/users/reset-user-password/reset-user-password.api');
    mockApiRequest.mockResolvedValue(undefined);

    const result = await resetUserPassword({ userId: '1' });

    expect(result).toBeUndefined();
  });
});
