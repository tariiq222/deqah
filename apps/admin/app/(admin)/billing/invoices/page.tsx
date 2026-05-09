'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@deqah/ui/primitives/button';
import { useListSubscriptionInvoices } from '@/features/billing/list-subscription-invoices/use-list-subscription-invoices';
import {
  InvoicesFilterBar,
  type InvoiceStatusFilter,
} from '@/features/billing/list-subscription-invoices/invoices-filter-bar';
import { InvoicesTable } from '@/features/billing/list-subscription-invoices/invoices-table';

export default function BillingInvoicesPage() {
  const tc = useTranslations('common');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<InvoiceStatusFilter>('all');
  const [organizationId, setOrganizationId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const { data, isLoading, error } = useListSubscriptionInvoices({
    page,
    perPage: 20,
    status: status === 'all' ? undefined : status,
    organizationId: organizationId.trim() || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  });

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        {/* TODO i18n: Invoices (no billing.invoicesTitle key; billing.invoicesLink exists for nav only) */}
        <h2 className="text-xl font-semibold">Invoices</h2>
        <p className="text-sm text-muted-foreground">
          {/* TODO i18n: Cross-tenant SaaS invoices. Drafts hidden by default. */}
          Cross-tenant SaaS invoices. Drafts hidden by default.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-destructive">
          Failed to load: {(error as Error).message}
        </p>
      ) : null}

      <InvoicesFilterBar
        status={status}
        onStatusChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
        organizationId={organizationId}
        onOrganizationIdChange={(v) => {
          setOrganizationId(v);
          setPage(1);
        }}
        fromDate={fromDate}
        onFromDateChange={(v) => {
          setFromDate(v);
          setPage(1);
        }}
        toDate={toDate}
        onToDateChange={(v) => {
          setToDate(v);
          setPage(1);
        }}
        onReset={() => {
          setStatus('all');
          setOrganizationId('');
          setFromDate('');
          setToDate('');
          setPage(1);
        }}
      />

      <InvoicesTable items={data?.items} isLoading={isLoading} />

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
