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

describe('update-plan.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls adminRequest with PATCH and correct URL', async () => {
    const { updatePlan } = await import('@/features/plans/update-plan/update-plan.api');
    mockApiRequest.mockResolvedValue({ id: 'plan-5' });

    await updatePlan({ planId: 'plan-5', nameEn: 'Pro Plan' });

    expect(mockApiRequest).toHaveBeenCalledWith('/admin/plans/plan-5', {
      method: 'PATCH',
      body: JSON.stringify({ nameEn: 'Pro Plan' }),
    });
  });

  it('strips planId from body', async () => {
    const { updatePlan } = await import('@/features/plans/update-plan/update-plan.api');
    mockApiRequest.mockResolvedValue({ id: '1' });

    await updatePlan({ planId: 'p-99', priceMonthly: 199 });

    const call = mockApiRequest.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.planId).toBeUndefined();
    expect(body.priceMonthly).toBe(199);
  });

  it('returns typed PlanRow', async () => {
    const { updatePlan } = await import('@/features/plans/update-plan/update-plan.api');
    const mockRow = { id: 'p-1', nameEn: 'Updated' };
    mockApiRequest.mockResolvedValue(mockRow);

    const result = await updatePlan({ planId: 'p-1' });

    expect(result.nameEn).toBe('Updated');
  });
});
