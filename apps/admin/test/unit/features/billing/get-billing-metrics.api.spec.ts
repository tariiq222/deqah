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

describe('get-billing-metrics.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls adminRequest with correct URL path', async () => {
    const { getBillingMetrics } = await import('@/features/billing/get-billing-metrics/get-billing-metrics.api');
    mockApiRequest.mockResolvedValue({
      mrr: '0', realizedMrr: '0', arr: '0', currency: 'SAR',
      counts: { TRIALING: 0, ACTIVE: 0, PAST_DUE: 0, SUSPENDED: 0, CANCELED: 0 },
      churn30d: 0, atRiskMrr: '0', scheduledDowngrades: 0, byPlan: [],
    });

    await getBillingMetrics();

    expect(mockApiRequest).toHaveBeenCalledWith('/admin/billing/metrics', {});
  });

  it('uses default GET method', async () => {
    const { getBillingMetrics } = await import('@/features/billing/get-billing-metrics/get-billing-metrics.api');
    mockApiRequest.mockResolvedValue({
      mrr: '0', realizedMrr: '0', arr: '0', currency: 'SAR',
      counts: { TRIALING: 0, ACTIVE: 0, PAST_DUE: 0, SUSPENDED: 0, CANCELED: 0 },
      churn30d: 0, atRiskMrr: '0', scheduledDowngrades: 0, byPlan: [],
    });

    await getBillingMetrics();

    const call = mockApiRequest.mock.calls[0] as [string, RequestInit?];
    expect(call[1]).toEqual({});
  });

  it('returns typed BillingMetrics', async () => {
    const { getBillingMetrics } = await import('@/features/billing/get-billing-metrics/get-billing-metrics.api');
    const mockMetrics = {
      mrr: '50000', realizedMrr: '48000', arr: '600000', currency: 'SAR',
      counts: { TRIALING: 10, ACTIVE: 90, PAST_DUE: 2, SUSPENDED: 1, CANCELED: 5 },
      churn30d: 3, atRiskMrr: '349', scheduledDowngrades: 2, byPlan: [],
    };
    mockApiRequest.mockResolvedValue(mockMetrics);

    const result = await getBillingMetrics();

    expect(result.mrr).toBe('50000');
    expect(result.realizedMrr).toBe('48000');
    expect(result.counts.ACTIVE).toBe(90);
    expect(result.churn30d).toBe(3);
    expect(result.atRiskMrr).toBe('349');
    expect(result.scheduledDowngrades).toBe(2);
  });
});
