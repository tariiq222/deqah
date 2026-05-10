import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import enMessages from '@/messages/en.json';
import PlansPage from '@/app/(admin)/plans/page';

const mockUseListPlans = vi.hoisted(() => vi.fn());

vi.mock('@/features/plans/list-plans/use-list-plans', () => ({
  useListPlans: mockUseListPlans,
}));

vi.mock('@/features/plans/list-plans/plans-table', () => ({
  PlansTable: function MockPlansTable({
    items,
    isLoading,
  }: {
    items?: unknown[];
    isLoading: boolean;
  }) {
    return (
      <div data-testid="plans-table">
        {isLoading ? 'Loading...' : `${items?.length ?? 0} plans`}
      </div>
    );
  },
}));

vi.mock('@/features/plans/delete-plan/delete-plan-dialog', () => ({
  DeletePlanDialog: function MockDeletePlanDialog({ open }: { open: boolean }) {
    return open ? <div data-testid="delete-plan-dialog">Delete Plan Dialog</div> : null;
  },
}));

const mockPlansData = [
  {
    id: 'plan-1',
    slug: 'BASIC',
    nameAr: 'الأساسية',
    nameEn: 'Basic',
    priceMonthly: 99,
    priceAnnual: 990,
    currency: 'SAR',
    isActive: true,
    isVisible: true,
    sortOrder: 1,
    limits: {},
    createdAt: '2024-01-01',
    _count: { subscriptions: 5 },
  },
];

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

describe('PlansPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseListPlans.mockReturnValue({
      data: mockPlansData,
      isLoading: false,
      error: null,
    });
  });

  it('renders page title and description', () => {
    render(<PlansPage />, { wrapper });
    expect(screen.getByText('Plans')).toBeInTheDocument();
    expect(screen.getByText(/Subscription plans available to tenants/i)).toBeInTheDocument();
  });

  it('renders plans table', () => {
    render(<PlansPage />, { wrapper });
    expect(screen.getByTestId('plans-table')).toBeInTheDocument();
  });

  it('renders error state when load fails', () => {
    mockUseListPlans.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed to load'),
    });

    render(<PlansPage />, { wrapper });
    expect(screen.getByText(/Failed to load/i)).toBeInTheDocument();
  });

  it('renders links to create and compare pages', () => {
    render(<PlansPage />, { wrapper });
    expect(screen.getByRole('link', { name: /compare plans/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /\+ create plan/i })).toBeInTheDocument();
  });
});
