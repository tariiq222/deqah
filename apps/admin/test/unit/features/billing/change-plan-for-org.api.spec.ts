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

describe('change-plan-for-org.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('changePlanForOrg', () => {
    it('calls adminRequest with PATCH and correct URL', async () => {
      const { changePlanForOrg } = await import('@/features/billing/change-plan-for-org/change-plan-for-org.api');
      mockApiRequest.mockResolvedValue({});

      await changePlanForOrg({ organizationId: 'org-3', newPlanId: 'plan-enterprise' });

      expect(mockApiRequest).toHaveBeenCalledWith('/admin/billing/subscriptions/org-3/plan', {
        method: 'PATCH',
        body: JSON.stringify({ newPlanId: 'plan-enterprise' }),
      });
    });

    it('returns unknown (api response)', async () => {
      const { changePlanForOrg } = await import('@/features/billing/change-plan-for-org/change-plan-for-org.api');
      mockApiRequest.mockResolvedValue({ success: true });

      const result = await changePlanForOrg({ organizationId: 'o', newPlanId: 'p' });

      expect(result).toEqual({ success: true });
    });
  });

  describe('listPlanOptions', () => {
    it('calls adminRequest with GET /plans', async () => {
      const { listPlanOptions } = await import('@/features/billing/change-plan-for-org/change-plan-for-org.api');
      mockApiRequest.mockResolvedValue([]);

      await listPlanOptions();

      expect(mockApiRequest).toHaveBeenCalledWith('/admin/plans', {});
    });

    it('returns typed PlanOption array', async () => {
      const { listPlanOptions } = await import('@/features/billing/change-plan-for-org/change-plan-for-org.api');
      const mockPlans = [{ id: 'p-1', slug: 'basic', nameEn: 'Basic', priceMonthly: 99, isActive: true }];
      mockApiRequest.mockResolvedValue(mockPlans);

      const result = await listPlanOptions();

      expect(result[0].priceMonthly).toBe(99);
    });
  });
});
