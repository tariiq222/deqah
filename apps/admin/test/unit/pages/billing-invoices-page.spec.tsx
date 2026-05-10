import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import enMessages from '@/messages/en.json';
import BillingInvoicesPage from '@/app/(admin)/billing/invoices/page';

const mockUseListSubscriptionInvoices = vi.hoisted(() => vi.fn());

vi.mock('@/features/billing/list-subscription-invoices/use-list-subscription-invoices', () => ({
  useListSubscriptionInvoices: mockUseListSubscriptionInvoices,
}));

vi.mock('@/features/billing/list-subscription-invoices/invoices-filter-bar', () => ({
  InvoicesFilterBar: function MockInvoicesFilterBar() {
    return <div data-testid="invoices-filter-bar">InvoicesFilterBar</div>;
  },
}));

vi.mock('@/features/billing/list-subscription-invoices/invoices-table', () => ({
  InvoicesTable: function MockInvoicesTable({
    items,
    isLoading,
  }: {
    items?: unknown[];
    isLoading: boolean;
  }) {
    return (
      <div data-testid="invoices-table">
        {isLoading ? 'Loading...' : `${items?.length ?? 0} invoices`}
      </div>
    );
  },
}));

const mockInvoicesData = {
  items: [
    {
      id: 'inv-1',
      subscriptionId: 'sub-1',
      organizationId: 'org-1',
      organization: { id: 'org-1', slug: 'org', nameAr: 'Test', nameEn: null, status: 'ACTIVE', suspendedAt: null },
      amount: 99,
      flatAmount: 99,
      overageAmount: 0,
      currency: 'SAR',
      status: 'PAID',
      billingCycle: 'MONTHLY',
      periodStart: '2024-01-01',
      periodEnd: '2024-01-31',
      dueDate: '2024-01-15',
      issuedAt: '2024-01-01',
      paidAt: '2024-01-10',
      refundedAmount: null,
      refundedAt: null,
      voidedReason: null,
      createdAt: '2024-01-01',
    },
  ],
  meta: { page: 1, perPage: 20, total: 1, totalPages: 1 },
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={enMessages}>
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

describe('BillingInvoicesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseListSubscriptionInvoices.mockReturnValue({
      data: mockInvoicesData,
      isLoading: false,
      error: null,
    });
  });

  it('renders page title and description', () => {
    render(<BillingInvoicesPage />, { wrapper });
    expect(screen.getByText('Invoices')).toBeInTheDocument();
    expect(screen.getByText(/Cross-tenant SaaS invoices/i)).toBeInTheDocument();
  });

  it('renders filter bar and table', () => {
    render(<BillingInvoicesPage />, { wrapper });
    expect(screen.getByTestId('invoices-filter-bar')).toBeInTheDocument();
    expect(screen.getByTestId('invoices-table')).toBeInTheDocument();
  });

  it('renders error state when load fails', () => {
    mockUseListSubscriptionInvoices.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed to load'),
    });

    render(<BillingInvoicesPage />, { wrapper });
    expect(screen.getByText(/Failed to load/i)).toBeInTheDocument();
  });

  it('renders pagination when multiple pages exist', () => {
    mockUseListSubscriptionInvoices.mockReturnValue({
      data: { ...mockInvoicesData, meta: { ...mockInvoicesData.meta, totalPages: 2 } },
      isLoading: false,
      error: null,
    });

    render(<BillingInvoicesPage />, { wrapper });
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
  });
});