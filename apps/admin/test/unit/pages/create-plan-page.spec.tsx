import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import CreatePlanPage from '@/app/(admin)/plans/new/page';

vi.mock('@/features/plans/create-plan/use-create-plan', () => ({
  useCreatePlan: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}));

vi.mock('@/features/plans/plan-form-tabs', () => ({
  PlanFormTabs: function MockPlanFormTabs({
    general,
    activeTab,
    onActiveTabChange,
  }: {
    general: React.ReactNode;
    activeTab: string;
    onActiveTabChange: (tab: string) => void;
  }) {
    return (
      <div data-testid="plan-form-tabs">
        <div data-testid="active-tab">{activeTab}</div>
        <button type="button" onClick={() => onActiveTabChange('general')}>General</button>
        <button type="button" onClick={() => onActiveTabChange('limits')}>Limits</button>
        <div data-testid="general-tab">{general}</div>
      </div>
    );
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
      <NextIntlClientProvider locale="en" messages={{}}>
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

  it('renders form tabs', () => {
    render(<CreatePlanPage />, { wrapper });
    expect(screen.getByTestId('plan-form-tabs')).toBeInTheDocument();
  });

  it('renders slug input', () => {
    render(<CreatePlanPage />, { wrapper });
    expect(screen.getByLabelText(/^Slug$/i)).toBeInTheDocument();
  });

  it('renders name inputs', () => {
    render(<CreatePlanPage />, { wrapper });
    expect(screen.getByLabelText(/Name \(Arabic\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Name \(English\)/i)).toBeInTheDocument();
  });

  it('renders price inputs', () => {
    render(<CreatePlanPage />, { wrapper });
    expect(screen.getByLabelText(/Monthly price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Annual price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Currency/i)).toBeInTheDocument();
  });

  it('disables submit button when form is invalid', () => {
    render(<CreatePlanPage />, { wrapper });

    const submitButton = screen.getByRole('button', { name: /create plan/i });
    expect(submitButton).toBeDisabled();
  });

  it('enables submit button when form is valid', async () => {
    const user = userEvent.setup();
    render(<CreatePlanPage />, { wrapper });

    await user.type(screen.getByLabelText(/^Slug$/i), 'STARTER');
    await user.type(screen.getByLabelText(/Name \(Arabic\)/i), 'الخطة');
    await user.type(screen.getByLabelText(/Name \(English\)/i), 'Starter Plan');
    await user.type(screen.getByLabelText(/Monthly price/i), '99');
    await user.type(screen.getByLabelText(/Annual price/i), '990');

    const submitButton = screen.getByRole('button', { name: /create plan/i });
    expect(submitButton).not.toBeDisabled();
  });

  it('renders cancel button', () => {
    render(<CreatePlanPage />, { wrapper });
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });
});