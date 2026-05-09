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

describe('update-vertical.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls adminRequest with PATCH and correct URL', async () => {
    const { updateVertical } = await import('@/features/verticals/update-vertical/update-vertical.api');
    mockApiRequest.mockResolvedValue({ id: 'v-5' });

    await updateVertical({ verticalId: 'v-5', nameEn: 'Updated Medical' });

    expect(mockApiRequest).toHaveBeenCalledWith('/admin/verticals/v-5', {
      method: 'PATCH',
      body: JSON.stringify({ nameEn: 'Updated Medical' }),
    });
  });

  it('strips verticalId from body', async () => {
    const { updateVertical } = await import('@/features/verticals/update-vertical/update-vertical.api');
    mockApiRequest.mockResolvedValue({ id: '1' });

    await updateVertical({ verticalId: 'v-99', nameAr: 'محدث' });

    const call = mockApiRequest.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.verticalId).toBeUndefined();
    expect(body.nameAr).toBe('محدث');
  });

  it('returns typed VerticalRow', async () => {
    const { updateVertical } = await import('@/features/verticals/update-vertical/update-vertical.api');
    const mockRow = { id: 'v-1', nameEn: 'Updated' };
    mockApiRequest.mockResolvedValue(mockRow);

    const result = await updateVertical({ verticalId: 'v-1' });

    expect(result.nameEn).toBe('Updated');
  });
});
