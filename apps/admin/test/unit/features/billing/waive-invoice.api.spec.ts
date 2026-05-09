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

describe('waive-invoice.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls adminRequest with POST and correct URL', async () => {
    const { waiveInvoice } = await import('@/features/billing/waive-invoice/waive-invoice.api');
    mockApiRequest.mockResolvedValue({ id: 'inv-1', status: 'WAIVED' });

    await waiveInvoice({ invoiceId: 'inv-55' });

    expect(mockApiRequest).toHaveBeenCalledWith('/admin/billing/invoices/inv-55/waive', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  });

  it('returns typed SubscriptionInvoiceRow', async () => {
    const { waiveInvoice } = await import('@/features/billing/waive-invoice/waive-invoice.api');
    const mockRow = { id: 'inv-2', status: 'WAIVED' as const, amount: 990 };
    mockApiRequest.mockResolvedValue(mockRow);

    const result = await waiveInvoice({ invoiceId: 'inv-2' });

    expect(result.status).toBe('WAIVED');
  });
});
