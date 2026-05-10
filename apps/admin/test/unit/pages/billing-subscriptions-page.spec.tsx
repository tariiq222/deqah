import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import enMessages from '@/messages/en.json';
import BillingSubscriptionsPage from '@/app/(admin)/billing/page';

const mockUseListSubscriptions = vi.hoisted(() => vi.fn());

vi.mock('@/features/billing/list-subscriptions/use-list-subscriptions', () => ({
  useListSubscriptions: mockUseListSubscriptions,
}));

vi.mock('@/features/billing/list-subscriptions/subscriptions-filter-bar', () => ({
  SubscriptionsFilterBar: function MockSubscriptionsFilterBar() {
    return <div data-testid="subscriptions-filter-bar">SubscriptionsFilterBar</div>;
  },
}));

vi.mock('@/features/billing/list-subscriptions/subscriptions-table', () => ({
  SubscriptionsTable: function MockSubscriptionsTable({
    items,
    isLoading,
  }: {
    items?: unknown[];
    isLoading: boolean;
  }) {
    return (
      <div data-testid="subscriptions-table">
        {isLoading ? 'Loading...' : `${items?.length ?? 0} subscriptions`}
      </div>
    );
  },
}));

vi.mock('@/features/billing/get-billing-metrics/billing-metrics-grid', () => ({
  BillingMetricsGrid: function MockBillingMetricsGrid() {
    return <div data-testid="billing-metrics-grid">BillingMetricsGrid</div>;
  },
}));

const mockSubscriptionsData = {
  items: [
    {
      id: 'sub-1',
      organizationId: 'org-1',
      organization: { id: 'org-1', slug: 'org', nameAr: 'Test', nameEn: null, status: 'ACTIVE', suspendedAt: null },
      planId: 'plan-1',
      status: 'ACTIVE',
      billingCycle: 'MONTHLY',
      currentPeriodStart: '2024-01-01',
      currentPeriodEnd: '2024-01-31',
      trialEndsAt: null,
      canceledAt: null,
      cancelAtPeriodEnd: false,
      pastDueSince: null,
      lastPaymentAt: null,
      lastFailureReason: null,
      createdAt: '2024-01-01',
      plan: { slug: 'basic', nameEn: 'Basic', priceMonthly: 99 },
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

describe('BillingSubscriptionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseListSubscriptions.mockReturnValue({
      data: mockSubscriptionsData,
      isLoading: false,
      error: null,
    });
  });

  it('renders page title and description', () => {
    render(<BillingSubscriptionsPage />, { wrapper });
    expect(screen.getByText('Billing')).toBeInTheDocument();
    expect(screen.getByText(/SaaS subscriptions across all tenants/i)).toBeInTheDocument();
  });

  it('renders filter bar and table', () => {
    render(<BillingSubscriptionsPage />, { wrapper });
    expect(screen.getByTestId('subscriptions-filter-bar')).toBeInTheDocument();
    expect(screen.getByTestId('subscriptions-table')).toBeInTheDocument();
    expect(screen.getByTestId('billing-metrics-grid')).toBeInTheDocument();
  });

  it('renders error state when load fails', () => {
    mockUseListSubscriptions.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed to load'),
    });

    render(<BillingSubscriptionsPage />, { wrapper });
    expect(screen.getByText(/Failed to load/i)).toBeInTheDocument();
  });

  it('renders pagination when multiple pages exist', () => {
    mockUseListSubscriptions.mockReturnValue({
      data: { ...mockSubscriptionsData, meta: { ...mockSubscriptionsData.meta, totalPages: 2 } },
      isLoading: false,
      error: null,
    });

    render(<BillingSubscriptionsPage />, { wrapper });
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
  });

  it('renders link to invoices page', () => {
    render(<BillingSubscriptionsPage />, { wrapper });
    expect(screen.getByRole('link', { name: /invoices/i })).toBeInTheDocument();
  });
});