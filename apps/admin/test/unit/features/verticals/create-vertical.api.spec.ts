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

describe('create-vertical.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls adminRequest with POST and correct URL', async () => {
    const { createVertical } = await import('@/features/verticals/create-vertical/create-vertical.api');
    mockApiRequest.mockResolvedValue({ id: 'v-new' });

    await createVertical({
      slug: 'fitness',
      nameAr: 'لياقة',
      nameEn: 'Fitness',
      templateFamily: 'FITNESS',
    });

    expect(mockApiRequest).toHaveBeenCalledWith('/admin/verticals', {
      method: 'POST',
      body: JSON.stringify({
        slug: 'fitness',
        nameAr: 'لياقة',
        nameEn: 'Fitness',
        templateFamily: 'FITNESS',
      }),
    });
  });

  it('serializes optional fields', async () => {
    const { createVertical } = await import('@/features/verticals/create-vertical/create-vertical.api');
    mockApiRequest.mockResolvedValue({ id: '1' });

    await createVertical({
      slug: 's',
      nameAr: 's',
      nameEn: 's',
      templateFamily: 'MEDICAL',
      descriptionAr: 'وصف',
      descriptionEn: 'Desc',
      iconUrl: 'https://icon.png',
      isActive: false,
      sortOrder: 3,
    });

    const call = mockApiRequest.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.descriptionAr).toBe('وصف');
    expect(body.sortOrder).toBe(3);
  });

  it('returns typed VerticalRow', async () => {
    const { createVertical } = await import('@/features/verticals/create-vertical/create-vertical.api');
    const mockRow = { id: 'v-1', slug: 'salon', nameEn: 'Salon' };
    mockApiRequest.mockResolvedValue(mockRow);

    const result = await createVertical({ slug: 'sal', nameAr: 'س', nameEn: 'Sal', templateFamily: 'SALON' });

    expect(result.id).toBe('v-1');
  });
});
