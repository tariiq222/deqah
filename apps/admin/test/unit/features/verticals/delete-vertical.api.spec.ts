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

describe('delete-vertical.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls adminRequest with DELETE and correct URL', async () => {
    const { deleteVertical } = await import('@/features/verticals/delete-vertical/delete-vertical.api');
    mockApiRequest.mockResolvedValue(undefined);

    await deleteVertical({ verticalId: 'vertical-12' });

    expect(mockApiRequest).toHaveBeenCalledWith('/admin/verticals/vertical-12', {
      method: 'DELETE',
      body: JSON.stringify({}),
    });
  });

  it('returns void', async () => {
    const { deleteVertical } = await import('@/features/verticals/delete-vertical/delete-vertical.api');
    mockApiRequest.mockResolvedValue(undefined);

    const result = await deleteVertical({ verticalId: '1' });

    expect(result).toBeUndefined();
  });
});
