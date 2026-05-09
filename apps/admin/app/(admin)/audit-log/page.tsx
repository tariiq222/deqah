'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@deqah/ui/primitives/button';
import { useListAuditLog } from '@/features/audit-log/list-audit-log/use-list-audit-log';
import { AuditLogFilterBar } from '@/features/audit-log/list-audit-log/audit-log-filter-bar';
import { AuditLogTable } from '@/features/audit-log/list-audit-log/audit-log-table';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ErrorBanner } from '@/components/error-banner';

export default function AuditLogPage() {
  const pathname = usePathname();
  const t = useTranslations('auditLog');
  const tc = useTranslations('common');
  const [page, setPage] = useState(1);
  const [actionType, setActionType] = useState<string>('all');
  const [organizationId, setOrganizationId] = useState('');

  const { data, isLoading, error, refetch } = useListAuditLog({
    page,
    perPage: 50,
    actionType,
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
            {t('totalEntries', { count: data.meta.total })}
          </span>
        ) : null}
      </div>

      <AuditLogFilterBar
        actionType={actionType}
        onActionTypeChange={(v) => { setActionType(v); setPage(1); }}
        organizationId={organizationId}
        onOrganizationIdChange={(v) => { setOrganizationId(v); setPage(1); }}
        onReset={() => { setActionType('all'); setOrganizationId(''); setPage(1); }}
      />

      {error ? (
        <ErrorBanner error={error} onRetry={() => void refetch()} context="page:audit-log" />
      ) : null}

      <AuditLogTable items={data?.items} isLoading={isLoading} />

      {data && data.meta.totalPages > 1 ? (
        <div className="flex items-center justify-between text-[13px] text-muted-foreground">
          <span className="tabular-nums">
            {t('pagination.summary', { page: data.meta.page, totalPages: data.meta.totalPages })}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}>
              {t('pagination.previous')}
            </Button>
            <Button variant="outline" size="sm" disabled={page >= data.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}>
              {t('pagination.next')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
