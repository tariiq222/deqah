import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import enMessages from '@/messages/en.json';
import EditPlanPage from '@/app/(admin)/plans/[id]/edit/page';

const mockUseListPlans = vi.hoisted(() => vi.fn());
const mockUseUpdatePlan = vi.hoisted(() =>
  vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
);

vi.mock('@/features/plans/list-plans/use-list-plans', () => ({
  useListPlans: mockUseListPlans,
}));

vi.mock('@/features/plans/update-plan/use-update-plan', () => ({
  useUpdatePlan: mockUseUpdatePlan,
}));

// Mock FeaturesTab so step 2 renders a simple placeholder
vi.mock('@/features/plans/features-tab/features-tab', () => ({
  FeaturesTab: function MockFeaturesTab() {
    return <div data-testid="features-tab">Features Step</div>;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  useParams: () => ({ id: 'plan-1' }),
  usePathname: () => '/plans/plan-1/edit',
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

describe('EditPlanPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseListPlans.mockReturnValue({
      data: mockPlansData,
      isLoading: false,
    });
  });

  it('renders loading skeleton when loading', () => {
    mockUseListPlans.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    render(<EditPlanPage />, { wrapper });
    expect(document.querySelector('[class*="h-8"]')).toBeInTheDocument();
  });

  it('renders error when plan not found', () => {
    mockUseListPlans.mockReturnValue({
      data: [],
      isLoading: false,
    });

    render(<EditPlanPage />, { wrapper });
    expect(screen.getByText(/Plan not found/i)).toBeInTheDocument();
  });

  it('renders page title when plan found', () => {
    render(<EditPlanPage />, { wrapper });
    expect(screen.getByText('Edit plan')).toBeInTheDocument();
  });

  it('renders back link to plans', () => {
    render(<EditPlanPage />, { wrapper });
    expect(screen.getByRole('link', { name: /← back to plans/i })).toBeInTheDocument();
  });

  it('renders step 1 basics with plan data pre-filled', () => {
    render(<EditPlanPage />, { wrapper });
    // Slug shown as read-only in edit mode
    expect(screen.getByDisplayValue('BASIC')).toBeInTheDocument();
    expect(screen.getByDisplayValue('الأساسية')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Basic')).toBeInTheDocument();
  });

  it('renders Active switch in step 1 edit mode', () => {
    render(<EditPlanPage />, { wrapper });
    expect(screen.getByLabelText(/^Active$/i)).toBeInTheDocument();
  });

  it('advances to step 2 after clicking Next on pre-filled form', async () => {
    const user = userEvent.setup();
    render(<EditPlanPage />, { wrapper });

    const nextButton = screen.getByRole('button', { name: /^next$/i });
    expect(nextButton).not.toBeDisabled();
    await user.click(nextButton);

    expect(screen.getByTestId('features-tab')).toBeInTheDocument();
  });

  it('advances to step 3 and shows Save changes button', async () => {
    const user = userEvent.setup();
    render(<EditPlanPage />, { wrapper });

    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await user.click(screen.getByRole('button', { name: /^next$/i }));

    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('calls mutation on submit from step 3', async () => {
    const mockMutate = vi.fn();
    mockUseUpdatePlan.mockReturnValue({ mutate: mockMutate, isPending: false });

    const user = userEvent.setup();
    render(<EditPlanPage />, { wrapper });

    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: 'plan-1',
        nameAr: 'الأساسية',
        nameEn: 'Basic',
        priceMonthly: 99,
        priceAnnual: 990,
        currency: 'SAR',
        isActive: true,
      }),
      expect.any(Object),
    );
  });
});
