'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@deqah/ui/primitives/button';
import { useSearchUsers } from '@/features/users/search-users/use-search-users';
import { UsersFilterBar } from '@/features/users/search-users/users-filter-bar';
import { UsersTable } from '@/features/users/search-users/users-table';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ErrorBanner } from '@/components/error-banner';
import { StatsGrid, type StatsGridStat } from '@/components/stats-grid';

export default function UsersPage() {
  const pathname = usePathname();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [organizationId, setOrganizationId] = useState('');

  const { data, isLoading, error, refetch } = useSearchUsers({
    page,
    perPage: 20,
    search,
    organizationId,
  });

  const stats: StatsGridStat[] = [
    { label: 'Total', value: data?.meta.total ?? 0, variant: 'primary' },
  ];

  return (
    <div className="space-y-6">
      <Breadcrumbs pathname={pathname} />
      <div>
        <h2 className="text-2xl font-semibold">Users</h2>
        <p className="text-sm text-muted-foreground">
          Cross-tenant user search. Issue temporary passwords when support requires it.
        </p>
      </div>

      <StatsGrid stats={stats} isLoading={isLoading} />
      {/* TODO Phase 6.4 follow-up: extend BE search-users endpoint to return role/status breakdown for richer StatsGrid */}

      <UsersFilterBar
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        organizationId={organizationId}
        onOrganizationIdChange={(v) => {
          setOrganizationId(v);
          setPage(1);
        }}
        onReset={() => {
          setSearch('');
          setOrganizationId('');
          setPage(1);
        }}
      />

      {error ? (
        <ErrorBanner error={error} onRetry={() => void refetch()} context="page:users" />
      ) : null}

      <UsersTable items={data?.items} isLoading={isLoading} />

      {data && data.meta.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {data.meta.page} of {data.meta.totalPages} · {data.meta.total} total
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
