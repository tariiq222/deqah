import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import enMessages from '@/messages/en.json';
import ImpersonationSessionsPage from '@/app/(admin)/impersonation-sessions/page';

const mockUseListImpersonationSessions = vi.hoisted(() => vi.fn());

vi.mock('@/features/impersonation/list-impersonation-sessions/use-list-impersonation-sessions', () => ({
  useListImpersonationSessions: mockUseListImpersonationSessions,
}));

vi.mock('@/features/impersonation/list-impersonation-sessions/sessions-table', () => ({
  SessionsTable: function MockSessionsTable({
    items,
    isLoading,
  }: {
    items?: unknown[];
    isLoading: boolean;
  }) {
    return (
      <div data-testid="sessions-table">
        {isLoading ? 'Loading...' : `${items?.length ?? 0} sessions`}
      </div>
    );
  },
}));

vi.mock('@deqah/ui/primitives/select', () => ({
  Select: function MockSelect({ children, value, onValueChange }: { children: React.ReactNode; value: string; onValueChange: (v: string) => void }) {
    return (
      <select data-testid="mock-select" value={value} onChange={(e) => onValueChange(e.target.value)}>
        {children}
      </select>
    );
  },
  SelectContent: function MockSelectContent({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
  },
  SelectItem: function MockSelectItem({ value, children }: { value: string; children: React.ReactNode }) {
    return <option value={value}>{children}</option>;
  },
  SelectTrigger: function MockSelectTrigger({ children }: { children: React.ReactNode }) {
    return <button>{children}</button>;
  },
  SelectValue: function MockSelectValue({ placeholder }: { placeholder?: string }) {
    return <span>{placeholder || 'Select value'}</span>;
  },
}));

const mockSessionsData = {
  items: [
    {
      id: 'session-1',
      superAdminUserId: 'admin-1',
      targetUserId: 'user-1',
      organizationId: 'org-1',
      reason: 'Testing',
      startedAt: '2024-01-01T00:00:00Z',
      endedAt: null,
      expiresAt: '2024-01-01T01:00:00Z',
      endedReason: null,
    },
  ],
  meta: { page: 1, perPage: 50, total: 1, totalPages: 1 },
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

describe('ImpersonationSessionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseListImpersonationSessions.mockReturnValue({
      data: mockSessionsData,
      isLoading: false,
      error: null,
    });
  });

  it('renders page title and description', () => {
    render(<ImpersonationSessionsPage />, { wrapper });
    expect(screen.getByText('Impersonation sessions')).toBeInTheDocument();
    expect(screen.getByText(/Active and historical shadow sessions/i)).toBeInTheDocument();
  });

  it('renders sessions table', () => {
    render(<ImpersonationSessionsPage />, { wrapper });
    expect(screen.getByTestId('sessions-table')).toBeInTheDocument();
  });

  it('renders error state when load fails', () => {
    mockUseListImpersonationSessions.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed to load'),
    });

    render(<ImpersonationSessionsPage />, { wrapper });
    expect(screen.getByText(/Failed to load/i)).toBeInTheDocument();
  });

  it('renders pagination when multiple pages exist', () => {
    mockUseListImpersonationSessions.mockReturnValue({
      data: { ...mockSessionsData, meta: { ...mockSessionsData.meta, totalPages: 2 } },
      isLoading: false,
      error: null,
    });

    render(<ImpersonationSessionsPage />, { wrapper });
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
  });
});
