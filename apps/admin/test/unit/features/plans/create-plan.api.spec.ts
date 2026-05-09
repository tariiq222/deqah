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

describe('create-plan.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls adminRequest with POST and correct URL', async () => {
    const { createPlan } = await import('@/features/plans/create-plan/create-plan.api');
    mockApiRequest.mockResolvedValue({ id: 'plan-new' });

    await createPlan({
      slug: 'plan-plus',
      nameAr: 'خطة بلس',
      nameEn: 'Plan Plus',
      priceMonthly: 99,
      priceAnnual: 990,
      limits: { users: 10 },
    });

    expect(mockApiRequest).toHaveBeenCalledWith('/admin/plans', {
      method: 'POST',
      body: JSON.stringify({
        slug: 'plan-plus',
        nameAr: 'خطة بلس',
        nameEn: 'Plan Plus',
        priceMonthly: 99,
        priceAnnual: 990,
        limits: { users: 10 },
      }),
    });
  });

  it('includes optional fields when provided', async () => {
    const { createPlan } = await import('@/features/plans/create-plan/create-plan.api');
    mockApiRequest.mockResolvedValue({ id: '1' });

    await createPlan({
      slug: 'a',
      nameAr: 'a',
      nameEn: 'a',
      priceMonthly: 1,
      priceAnnual: 10,
      limits: {},
      currency: 'SAR',
      isActive: false,
      sortOrder: 5,
    });

    const call = mockApiRequest.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.currency).toBe('SAR');
    expect(body.isActive).toBe(false);
  });

  it('returns typed PlanRow', async () => {
    const { createPlan } = await import('@/features/plans/create-plan/create-plan.api');
    const mockRow = { id: 'p-1', slug: 'basic', nameEn: 'Basic' };
    mockApiRequest.mockResolvedValue(mockRow);

    const result = await createPlan({ slug: 'b', nameAr: 'b', nameEn: 'b', priceMonthly: 1, priceAnnual: 10, limits: {} });

    expect(result.id).toBe('p-1');
  });
});
