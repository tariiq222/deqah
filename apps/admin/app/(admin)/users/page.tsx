'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@deqah/ui/primitives/button';
import { useSearchUsers } from '@/features/users/search-users/use-search-users';
import { UsersFilterBar } from '@/features/users/search-users/users-filter-bar';
import { UsersTable } from '@/features/users/search-users/users-table';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ErrorBanner } from '@/components/error-banner';

export default function UsersPage() {
  const pathname = usePathname();
  const t = useTranslations('users');
  const tc = useTranslations('common');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [organizationId, setOrganizationId] = useState('');

  const { data, isLoading, error, refetch } = useSearchUsers({
    page,
    perPage: 20,
    search,
    organizationId,
  });

  return (
    <div className="space-y-5">
      <Breadcrumbs pathname={pathname} />

      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{t('title')}</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {t('description')}
          </p>
        </div>
        {data ? (
          <span className="tabular-nums text-[13px] text-muted-foreground">
            {t('totalCount', { count: data.meta.total })}
          </span>
        ) : null}
      </div>

      <UsersFilterBar
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        organizationId={organizationId}
        onOrganizationIdChange={(v) => { setOrganizationId(v); setPage(1); }}
        onReset={() => { setSearch(''); setOrganizationId(''); setPage(1); }}
      />

      {error ? (
        <ErrorBanner error={error} onRetry={() => void refetch()} context="page:users" />
      ) : null}

      <UsersTable items={data?.items} isLoading={isLoading} />

      {data && data.meta.totalPages > 1 ? (
        <div className="flex items-center justify-between text-[13px] text-muted-foreground">
          <span className="tabular-nums">
            {tc('page')} {data.meta.page} {tc('of')} {data.meta.totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}>
              {tc('previous')}
            </Button>
            <Button variant="outline" size="sm" disabled={page >= data.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}>
              {tc('next')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
