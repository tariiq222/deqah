'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@deqah/ui/primitives/button';
import { useListSubscriptions } from '@/features/billing/list-subscriptions/use-list-subscriptions';
import {
  SubscriptionsFilterBar,
  type StatusFilter,
} from '@/features/billing/list-subscriptions/subscriptions-filter-bar';
import { SubscriptionsTable } from '@/features/billing/list-subscriptions/subscriptions-table';
import { BillingMetricsGrid } from '@/features/billing/get-billing-metrics/billing-metrics-grid';
import { ErrorBanner } from '@/components/error-banner';

export default function BillingSubscriptionsPage() {
  const t = useTranslations('billing');
  const tc = useTranslations('common');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>('all');

  const { data, isLoading, error, refetch } = useListSubscriptions({
    page,
    perPage: 20,
    status: status === 'all' ? undefined : status,
  });

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{t('title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('description')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/billing/invoices">{t('invoicesLink')}</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/billing/metrics">{t('metricsLink')}</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/billing/zoho">{t('zohoLink')}</Link>
          </Button>
        </div>
      </div>

      {error ? (
        <ErrorBanner error={error} onRetry={() => void refetch()} context="page:billing" />
      ) : null}

      {/* KPI strip */}
      <BillingMetricsGrid />

      {/* Filter + table */}
      <SubscriptionsFilterBar
        status={status}
        onStatusChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
        onReset={() => {
          setStatus('all');
          setPage(1);
        }}
      />

      <SubscriptionsTable items={data?.items} isLoading={isLoading} />

      {data && data.meta.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="tabular-nums">
            {tc('page')} {data.meta.page} {tc('of')} {data.meta.totalPages} · {data.meta.total} {tc('total')}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {tc('previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {tc('next')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
