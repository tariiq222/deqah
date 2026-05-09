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

describe('refund-invoice.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls adminRequest with POST and correct URL', async () => {
    const { refundInvoice } = await import('@/features/billing/refund-invoice/refund-invoice.api');
    mockApiRequest.mockResolvedValue({ id: 'inv-1', status: 'REFUNDED' });

    await refundInvoice({ invoiceId: 'inv-77', amount: 200 });

    expect(mockApiRequest).toHaveBeenCalledWith('/admin/billing/invoices/inv-77/refund', {
      method: 'POST',
      body: JSON.stringify({ amount: 200 }),
    });
  });

  it('omits amount from body when amount is undefined (full refund)', async () => {
    const { refundInvoice } = await import('@/features/billing/refund-invoice/refund-invoice.api');
    mockApiRequest.mockResolvedValue({ id: '1' });

    await refundInvoice({ invoiceId: 'inv-1' });

    const call = mockApiRequest.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.amount).toBeUndefined();
    expect(body.reason).toBeUndefined();
  });

  it('includes amount when provided', async () => {
    const { refundInvoice } = await import('@/features/billing/refund-invoice/refund-invoice.api');
    mockApiRequest.mockResolvedValue({ id: '1' });

    await refundInvoice({ invoiceId: 'inv-2', amount: 50 });

    const call = mockApiRequest.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.amount).toBe(50);
  });

  it('returns typed SubscriptionInvoiceRow', async () => {
    const { refundInvoice } = await import('@/features/billing/refund-invoice/refund-invoice.api');
    const mockRow = { id: 'inv-3', status: 'REFUNDED' as const, amount: 300 };
    mockApiRequest.mockResolvedValue(mockRow);

    const result = await refundInvoice({ invoiceId: 'inv-3', amount: 300 });

    expect(result.amount).toBe(300);
  });
});
