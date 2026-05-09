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

describe('grant-credit.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls adminRequest with POST and correct URL', async () => {
    const { grantCredit } = await import('@/features/billing/grant-credit/grant-credit.api');
    mockApiRequest.mockResolvedValue({ id: 'credit-1', organizationId: 'org-1', amount: 500 });

    await grantCredit({ organizationId: 'org-1', amount: 500 });

    expect(mockApiRequest).toHaveBeenCalledWith('/admin/billing/credits', {
      method: 'POST',
      body: JSON.stringify({ organizationId: 'org-1', amount: 500 }),
    });
  });

  it('includes optional currency when provided', async () => {
    const { grantCredit } = await import('@/features/billing/grant-credit/grant-credit.api');
    mockApiRequest.mockResolvedValue({ id: '1' });

    await grantCredit({ organizationId: 'o', amount: 100, currency: 'SAR' });

    const call = mockApiRequest.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.currency).toBe('SAR');
  });

  it('omits optional currency when not provided', async () => {
    const { grantCredit } = await import('@/features/billing/grant-credit/grant-credit.api');
    mockApiRequest.mockResolvedValue({ id: '1' });

    await grantCredit({ organizationId: 'o', amount: 100 });

    const call = mockApiRequest.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.currency).toBeUndefined();
  });

  it('returns typed CreditRow', async () => {
    const { grantCredit } = await import('@/features/billing/grant-credit/grant-credit.api');
    const mockRow = { id: 'cr-1', organizationId: 'org-x', amount: 200, balance: 200 };
    mockApiRequest.mockResolvedValue(mockRow);

    const result = await grantCredit({ organizationId: 'org-x', amount: 200 });

    expect(result.id).toBe('cr-1');
  });
});
