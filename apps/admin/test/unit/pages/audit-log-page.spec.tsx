import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import enMessages from '@/messages/en.json';
import AuditLogPage from '@/app/(admin)/audit-log/page';

const mockUseListAuditLog = vi.hoisted(() => vi.fn());

vi.mock('@/features/audit-log/list-audit-log/use-list-audit-log', () => ({
  useListAuditLog: mockUseListAuditLog,
}));

vi.mock('@/features/audit-log/list-audit-log/audit-log-filter-bar', () => ({
  AuditLogFilterBar: function MockAuditLogFilterBar() {
    return <div data-testid="audit-log-filter-bar">AuditLogFilterBar</div>;
  },
}));

vi.mock('@/features/audit-log/list-audit-log/audit-log-table', () => ({
  AuditLogTable: function MockAuditLogTable({
    items,
    isLoading,
  }: {
    items?: unknown[];
    isLoading: boolean;
  }) {
    return (
      <div data-testid="audit-log-table">
        {isLoading ? 'Loading...' : `${items?.length ?? 0} entries`}
      </div>
    );
  },
}));

const mockAuditLogData = {
  items: [
    {
      id: 'log-1',
      superAdminUserId: 'admin-1',
      actionType: 'DELETE_ORGANIZATION',
      organizationId: 'org-1',
      impersonationSessionId: null,
      reason: 'Test deletion',
      metadata: {},
      ipAddress: '127.0.0.1',
      userAgent: 'Test Agent',
      createdAt: '2024-01-01T00:00:00Z',
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

describe('AuditLogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseListAuditLog.mockReturnValue({
      data: mockAuditLogData,
      isLoading: false,
      error: null,
    });
  });

  it('renders page title and description', () => {
    render(<AuditLogPage />, { wrapper });
    expect(screen.getByText('Audit log')).toBeInTheDocument();
    expect(screen.getByText(/Every destructive super-admin action/i)).toBeInTheDocument();
  });

  it('renders filter bar and table', () => {
    render(<AuditLogPage />, { wrapper });
    expect(screen.getByTestId('audit-log-filter-bar')).toBeInTheDocument();
    expect(screen.getByTestId('audit-log-table')).toBeInTheDocument();
  });

  it('renders error state when load fails', () => {
    mockUseListAuditLog.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed to load'),
    });

    render(<AuditLogPage />, { wrapper });
    expect(screen.getByText(/Failed to load/i)).toBeInTheDocument();
  });

  it('renders pagination when multiple pages exist', () => {
    mockUseListAuditLog.mockReturnValue({
      data: { ...mockAuditLogData, meta: { ...mockAuditLogData.meta, totalPages: 2 } },
      isLoading: false,
      error: null,
    });

    render(<AuditLogPage />, { wrapper });
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
  });
});
