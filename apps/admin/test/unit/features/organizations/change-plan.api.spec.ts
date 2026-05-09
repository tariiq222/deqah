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

describe('change-plan.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls adminRequest with PATCH and correct URL', async () => {
    const { changePlanForOrg } = await import('@/features/organizations/change-plan/change-plan.api');
    mockApiRequest.mockResolvedValue({ id: 'org-3' });

    await changePlanForOrg('org-3', { newPlanId: 'plan-enterprise' });

    expect(mockApiRequest).toHaveBeenCalledWith('/admin/billing/subscriptions/org-3/plan', {
      method: 'PATCH',
      body: JSON.stringify({ newPlanId: 'plan-enterprise' }),
    });
  });

  it('returns typed { id: string }', async () => {
    const { changePlanForOrg } = await import('@/features/organizations/change-plan/change-plan.api');
    mockApiRequest.mockResolvedValue({ id: 'sub-1' });

    const result = await changePlanForOrg('org-1', { newPlanId: 'p-1' });

    expect(result.id).toBe('sub-1');
  });
});
