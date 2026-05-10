import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import enMessages from '@/messages/en.json';
import UsersPage from '@/app/(admin)/users/page';

const mockUseSearchUsers = vi.hoisted(() => vi.fn());

vi.mock('@/features/users/search-users/use-search-users', () => ({
  useSearchUsers: mockUseSearchUsers,
}));

vi.mock('@/features/users/search-users/users-filter-bar', () => ({
  UsersFilterBar: function MockUsersFilterBar() {
    return <div data-testid="users-filter-bar">UsersFilterBar</div>;
  },
}));

vi.mock('@/features/users/search-users/users-table', () => ({
  UsersTable: function MockUsersTable({
    items,
    isLoading,
  }: {
    items?: unknown[];
    isLoading: boolean;
  }) {
    return (
      <div data-testid="users-table">
        {isLoading ? 'Loading...' : `${items?.length ?? 0} users`}
      </div>
    );
  },
}));

const mockUsersData = {
  items: [
    {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      phone: null,
      role: 'ADMIN',
      isActive: true,
      isSuperAdmin: false,
      createdAt: '2024-01-01',
      memberships: [
        {
          role: 'ADMIN',
          organization: { id: 'org-1', nameAr: 'Test Org', nameEn: null, slug: 'test-org' },
        },
      ],
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

describe('UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearchUsers.mockReturnValue({
      data: mockUsersData,
      isLoading: false,
      error: null,
    });
  });

  it('renders page title and description', () => {
    render(<UsersPage />, { wrapper });
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText(/Cross-tenant user search/i)).toBeInTheDocument();
  });

  it('renders filter bar and table', () => {
    render(<UsersPage />, { wrapper });
    expect(screen.getByTestId('users-filter-bar')).toBeInTheDocument();
    expect(screen.getByTestId('users-table')).toBeInTheDocument();
  });

  it('renders error state when load fails', () => {
    mockUseSearchUsers.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed to load'),
    });

    render(<UsersPage />, { wrapper });
    expect(screen.getByText(/Failed to load/i)).toBeInTheDocument();
  });

  it('renders pagination when multiple pages exist', () => {
    mockUseSearchUsers.mockReturnValue({
      data: { ...mockUsersData, meta: { ...mockUsersData.meta, totalPages: 2 } },
      isLoading: false,
      error: null,
    });

    render(<UsersPage />, { wrapper });
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
  });
});
