import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import enMessages from '@/messages/en.json';
import CreatePlanPage from '@/app/(admin)/plans/new/page';

vi.mock('@/features/plans/create-plan/use-create-plan', () => ({
  useCreatePlan: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}));

// Mock FeaturesTab so step 2 renders a simple placeholder (avoids @deqah/shared catalog deps)
vi.mock('@/features/plans/features-tab/features-tab', () => ({
  FeaturesTab: function MockFeaturesTab() {
    return <div data-testid="features-tab">Features Step</div>;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

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

describe('CreatePlanPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page title and description', () => {
    render(<CreatePlanPage />, { wrapper });
    expect(screen.getByRole('heading', { name: 'Create plan' })).toBeInTheDocument();
    expect(screen.getByText(/Add a new subscription plan/i)).toBeInTheDocument();
  });

  it('renders back link to plans', () => {
    render(<CreatePlanPage />, { wrapper });
    expect(screen.getByRole('link', { name: /← back to plans/i })).toBeInTheDocument();
  });

  it('renders step 1 basics fields on initial render', () => {
    render(<CreatePlanPage />, { wrapper });
    expect(screen.getByLabelText(/^Plan code$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Name \(Arabic\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Name \(English\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Monthly price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Annual price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Currency/i)).toBeInTheDocument();
  });

  it('Next button is enabled even when step 1 form is invalid (shows inline errors on click)', () => {
    render(<CreatePlanPage />, { wrapper });
    const nextButton = screen.getByRole('button', { name: /^next$/i });
    expect(nextButton).not.toBeDisabled();
  });

  it('Next button is enabled when step 1 form is valid', async () => {
    const user = userEvent.setup();
    render(<CreatePlanPage />, { wrapper });

    await user.type(screen.getByLabelText(/^Plan code$/i), 'STARTER');
    await user.type(screen.getByLabelText(/Name \(Arabic\)/i), 'الخطة');
    await user.type(screen.getByLabelText(/Name \(English\)/i), 'Starter Plan');
    await user.type(screen.getByLabelText(/Monthly price/i), '99');
    await user.type(screen.getByLabelText(/Annual price/i), '990');

    const nextButton = screen.getByRole('button', { name: /^next$/i });
    expect(nextButton).not.toBeDisabled();
  });

  it('advances to step 2 (features) after filling step 1 and clicking Next', async () => {
    const user = userEvent.setup();
    render(<CreatePlanPage />, { wrapper });

    await user.type(screen.getByLabelText(/^Plan code$/i), 'STARTER');
    await user.type(screen.getByLabelText(/Name \(Arabic\)/i), 'الخطة');
    await user.type(screen.getByLabelText(/Name \(English\)/i), 'Starter Plan');
    await user.type(screen.getByLabelText(/Monthly price/i), '99');
    await user.type(screen.getByLabelText(/Annual price/i), '990');

    await user.click(screen.getByRole('button', { name: /^next$/i }));

    expect(screen.getByTestId('features-tab')).toBeInTheDocument();
  });

  it('advances to step 3 (review) after step 2 and shows Create plan button', async () => {
    const user = userEvent.setup();
    render(<CreatePlanPage />, { wrapper });

    await user.type(screen.getByLabelText(/^Plan code$/i), 'STARTER');
    await user.type(screen.getByLabelText(/Name \(Arabic\)/i), 'الخطة');
    await user.type(screen.getByLabelText(/Name \(English\)/i), 'Starter Plan');
    await user.type(screen.getByLabelText(/Monthly price/i), '99');
    await user.type(screen.getByLabelText(/Annual price/i), '990');

    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await user.click(screen.getByRole('button', { name: /^next$/i }));

    expect(screen.getByRole('button', { name: /create plan/i })).toBeInTheDocument();
  });

  it('calls mutation on submit from step 3', async () => {
    const { useCreatePlan } = await import('@/features/plans/create-plan/use-create-plan');
    const mockMutate = vi.fn();
    vi.mocked(useCreatePlan).mockReturnValue(
      // Cast through unknown to satisfy strict UseMutationResult shape in tests
      { mutate: mockMutate, isPending: false } as unknown as ReturnType<typeof useCreatePlan>,
    );

    const user = userEvent.setup();
    render(<CreatePlanPage />, { wrapper });

    await user.type(screen.getByLabelText(/^Plan code$/i), 'STARTER');
    await user.type(screen.getByLabelText(/Name \(Arabic\)/i), 'الخطة');
    await user.type(screen.getByLabelText(/Name \(English\)/i), 'Starter Plan');
    await user.type(screen.getByLabelText(/Monthly price/i), '99');
    await user.type(screen.getByLabelText(/Annual price/i), '990');

    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await user.click(screen.getByRole('button', { name: /create plan/i }));

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'STARTER',
        nameAr: 'الخطة',
        nameEn: 'Starter Plan',
        priceMonthly: 99,
        priceAnnual: 990,
        currency: 'SAR',
        isActive: true,
      }),
      expect.any(Object),
    );
  });

  it('renders cancel button', () => {
    render(<CreatePlanPage />, { wrapper });
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });
});
