'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@deqah/ui/primitives/button';
import { Input } from '@deqah/ui/primitives/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@deqah/ui/primitives/select';
import { useListDeliveryLog } from '@/features/notifications/list-delivery-log/use-list-delivery-log';
import { DeliveryLogTable } from '@/features/notifications/list-delivery-log/delivery-log-table';
import type { DeliveryLogFilters } from '@/features/notifications/list-delivery-log/list-delivery-log.api';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ErrorBanner } from '@/components/error-banner';

const PER_PAGE = 20;

export default function NotificationsPage() {
  const pathname = usePathname();
  const t = useTranslations('notifications');
  const tc = useTranslations('common');
  const [page, setPage] = useState(1);
  const [organizationId, setOrganizationId] = useState('');
  const [status, setStatus] = useState('all');
  const [channel, setChannel] = useState('all');

  const filters: DeliveryLogFilters = {
    organizationId: organizationId || undefined,
    status,
    channel,
    page,
    perPage: PER_PAGE,
  };

  const { data, isLoading, error } = useListDeliveryLog(filters);
  const meta = data?.meta;
  const isFiltered = organizationId !== '' || status !== 'all' || channel !== 'all';

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
        {/* Live auto-refresh indicator */}
        <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-success animate-pulse" />
          Live · 30s
        </span>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 border-y border-border py-2">
        <Input
          placeholder={t('filters.organizationId')}
          value={organizationId}
          onChange={(e) => { setOrganizationId(e.target.value); setPage(1); }}
          className="h-8 w-52 font-mono text-[13px]"
        />

        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-36 text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {/* TODO i18n: "All statuses" */}
            <SelectItem value="all">All statuses</SelectItem>
            {/* TODO i18n: status enum labels Pending / Sent / Failed / Skipped */}
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="SENT">Sent</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
            <SelectItem value="SKIPPED">Skipped</SelectItem>
          </SelectContent>
        </Select>

        <Select value={channel} onValueChange={(v) => { setChannel(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-36 text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {/* TODO i18n: "All channels" */}
            <SelectItem value="all">All channels</SelectItem>
            {/* TODO i18n: channel enum labels Email / SMS / Push / In-App */}
            <SelectItem value="EMAIL">Email</SelectItem>
            <SelectItem value="SMS">SMS</SelectItem>
            <SelectItem value="PUSH">Push</SelectItem>
            <SelectItem value="IN_APP">In-App</SelectItem>
          </SelectContent>
        </Select>

        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => { setOrganizationId(''); setStatus('all'); setChannel('all'); setPage(1); }}
          >
            {tc('reset')}
          </Button>
        )}

        {meta ? (
          <span className="ml-auto tabular-nums text-[12px] text-muted-foreground">
            {/* TODO i18n: "{total} entries" — no matching key */}
            {meta.total} entries
          </span>
        ) : null}
      </div>

      {error ? (
        <ErrorBanner error={error} context="page:notifications" />
      ) : null}

      <DeliveryLogTable items={data?.items} isLoading={isLoading} />

      {meta && meta.totalPages > 1 ? (
        <div className="flex items-center justify-between text-[13px] text-muted-foreground">
          <span className="tabular-nums">
            {t('pagination.summary', { page, totalPages: meta.totalPages, total: meta.total })}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}>
              {t('pagination.previous')}
            </Button>
            <Button variant="outline" size="sm" disabled={page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}>
              {t('pagination.next')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
