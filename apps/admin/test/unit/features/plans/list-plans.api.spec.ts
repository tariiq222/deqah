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

describe('list-plans.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls adminRequest with correct URL path', async () => {
    const { listPlans } = await import('@/features/plans/list-plans/list-plans.api');
    mockApiRequest.mockResolvedValue([]);

    await listPlans();

    expect(mockApiRequest).toHaveBeenCalledWith('/admin/plans', {});
  });

  it('uses GET method (default)', async () => {
    const { listPlans } = await import('@/features/plans/list-plans/list-plans.api');
    mockApiRequest.mockResolvedValue([]);

    await listPlans();

    const call = mockApiRequest.mock.calls[0] as [string, RequestInit?];
    expect(call[1]).toEqual({});
  });

  it('returns typed PlanRow array', async () => {
    const { listPlans } = await import('@/features/plans/list-plans/list-plans.api');
    const mockPlans = [{ id: '1', slug: 'basic', nameEn: 'Basic' }];
    mockApiRequest.mockResolvedValue({ items: mockPlans, meta: { page: 1, perPage: 20, total: 1, totalPages: 1 } });

    const result = await listPlans();

    expect(result[0].slug).toBe('basic');
  });
});
