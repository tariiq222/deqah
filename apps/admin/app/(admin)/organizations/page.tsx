'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { Button } from '@deqah/ui/primitives/button';
import { CreateTenantDialog } from '@/features/organizations/create-tenant/create-tenant-dialog';
import { useListOrganizations } from '@/features/organizations/list-organizations/use-list-organizations';
import {
  type LifecycleStatusFilter,
  OrganizationsFilterBar,
  type SuspendedFilter,
} from '@/features/organizations/list-organizations/organizations-filter-bar';
import { OrganizationsTable } from '@/features/organizations/list-organizations/organizations-table';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ErrorBanner } from '@/components/error-banner';

export default function OrganizationsListPage() {
  const t = useTranslations('organizations');
  const tc = useTranslations('common');
  const pathname = usePathname();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [suspended, setSuspended] = useState<SuspendedFilter>('all');
  const [status, setStatus] = useState<LifecycleStatusFilter>('all');
  const [verticalId, setVerticalId] = useState('');
  const [planId, setPlanId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, error, refetch } = useListOrganizations({
    page,
    perPage: 20,
    search: search.trim() || undefined,
    suspended: suspended === 'all' ? undefined : suspended,
    status: status === 'all' ? undefined : status,
    verticalId: verticalId.trim() || undefined,
    planId: planId.trim() || undefined,
  });

  return (
    <div className="space-y-6">
      <Breadcrumbs pathname={pathname} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex items-center gap-2">
          {data ? (
            <span className="tabular text-sm text-muted-foreground">
              {data.meta.total} {tc('total')}
            </span>
          ) : null}
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            {t('create.button')}
          </Button>
        </div>
      </div>

      <OrganizationsFilterBar
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        suspended={suspended}
        onSuspendedChange={(v) => {
          setSuspended(v);
          setPage(1);
        }}
        status={status}
        onStatusChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
        verticalId={verticalId}
        onVerticalIdChange={(v) => {
          setVerticalId(v);
          setPage(1);
        }}
        planId={planId}
        onPlanIdChange={(v) => {
          setPlanId(v);
          setPage(1);
        }}
        onReset={() => {
          setSearch('');
          setSuspended('all');
          setStatus('all');
          setVerticalId('');
          setPlanId('');
          setPage(1);
        }}
      />

      {error ? (
        <ErrorBanner
          error={error}
          onRetry={() => void refetch()}
          context="page:organizations"
        />
      ) : null}

      <OrganizationsTable items={data?.items} isLoading={isLoading} />

      {data && data.meta.totalPages > 1 ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="tabular">
            {t('pagination.summary', {
              page: data.meta.page,
              totalPages: data.meta.totalPages,
              total: data.meta.total,
            })}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t('pagination.previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={page >= data.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('pagination.next')}
            </Button>
          </div>
        </div>
      ) : null}

      <CreateTenantDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
