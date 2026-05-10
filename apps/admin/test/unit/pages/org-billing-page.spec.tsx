import { render, screen, waitFor, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Suspense } from 'react';
import enMessages from '@/messages/en.json';
import OrgBillingPage from '@/app/(admin)/billing/[orgId]/page';

vi.mock('@/features/billing/get-org-billing/org-billing-detail', () => ({
  OrgBillingDetail: function MockOrgBillingDetail({ orgId }: { orgId: string }) {
    return <div data-testid="org-billing-detail">OrgBillingDetail for {orgId}</div>;
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <Suspense fallback={<div>Loading…</div>}>
          {children}
        </Suspense>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

describe('OrgBillingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page title with orgId', async () => {
    const params = Promise.resolve({ orgId: 'org-123' });
    await act(async () => {
      render(<OrgBillingPage params={params} />, { wrapper });
      await params;
    });

    await waitFor(() => {
      expect(screen.getByText('Tenant billing')).toBeInTheDocument();
      expect(screen.getByText('org-123')).toBeInTheDocument();
    });
  });

  it('renders back link to subscriptions', async () => {
    const params = Promise.resolve({ orgId: 'org-123' });
    await act(async () => {
      render(<OrgBillingPage params={params} />, { wrapper });
      await params;
    });

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /subscriptions/i })).toBeInTheDocument();
    });
  });

  it('renders org billing detail component', async () => {
    const params = Promise.resolve({ orgId: 'org-123' });
    await act(async () => {
      render(<OrgBillingPage params={params} />, { wrapper });
      await params;
    });

    await waitFor(() => {
      expect(screen.getByTestId('org-billing-detail')).toBeInTheDocument();
      expect(screen.getByTestId('org-billing-detail')).toHaveTextContent('org-123');
    });
  });
});
