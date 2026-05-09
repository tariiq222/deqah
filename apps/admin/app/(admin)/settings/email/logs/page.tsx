'use client';

import { useEffect, useState, startTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  listLogs,
  PlatformEmailLogRow,
  PlatformEmailLogStatus,
} from '@/features/platform-email/platform-email.api';
import { ApiError } from '@/lib/api-client';

function StatusBadge({ status }: { status: PlatformEmailLogStatus }) {
  const styles: Record<PlatformEmailLogStatus, string> = {
    QUEUED: 'bg-muted text-muted-foreground',
    SENT: 'bg-success/10 text-success border border-success/30',
    FAILED: 'bg-destructive/10 text-destructive border border-destructive/30',
    SKIPPED_NOT_CONFIGURED: 'bg-muted text-muted-foreground',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status.replace(/_/g, ' ').toLowerCase()}
    </span>
  );
}

export default function EmailLogsPage() {
  const t = useTranslations('settings.email.logs');

  const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
    { value: '', label: t('filters.status') },
    { value: 'QUEUED', label: t('statuses.queued') },
    { value: 'SENT', label: t('statuses.sent') },
    { value: 'FAILED', label: t('statuses.failed') },
    { value: 'SKIPPED_NOT_CONFIGURED', label: 'Skipped' },
  ];

  const [items, setItems] = useState<PlatformEmailLogRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState('');
  const [slugFilter, setSlugFilter] = useState('');
  const [orgFilter, setOrgFilter] = useState('');

  const load = (cursor?: string) => {
    setIsLoading(true);
    setError(null);
    listLogs({
      status: statusFilter ? (statusFilter as PlatformEmailLogStatus) : undefined,
      templateSlug: slugFilter || undefined,
      organizationId: orgFilter || undefined,
      cursor,
      limit: 50,
    })
      .then((res) => {
        setItems(cursor ? (prev) => [...prev, ...res.items] : res.items);
        setNextCursor(res.nextCursor);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load logs')) // TODO i18n: Failed to load logs
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    startTransition(() => { load(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, slugFilter, orgFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('description')}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          type="text"
          value={slugFilter}
          onChange={(e) => setSlugFilter(e.target.value)}
          placeholder={t('filters.slug')}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm w-52"
        />
        <input
          type="text"
          value={orgFilter}
          onChange={(e) => setOrgFilter(e.target.value)}
          placeholder={t('filters.org')}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm w-52"
        />
        <button
          onClick={() => { setStatusFilter(''); setSlugFilter(''); setOrgFilter(''); }}
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          {t('filters.reset')}
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-start text-muted-foreground">
              <th className="py-2 pe-4 font-medium text-start">{t('table.template')}</th>
              <th className="py-2 pe-4 font-medium text-start">{t('table.to')}</th>
              <th className="py-2 pe-4 font-medium text-start">{t('table.status')}</th>
              <th className="py-2 pe-4 font-medium text-start">{t('table.org')}</th>
              <th className="py-2 pe-4 font-medium text-start">{t('table.created')}</th>
              <th className="py-2 font-medium text-start">{t('table.error')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="py-2 pe-4 font-mono text-xs">{row.templateSlug}</td>
                <td className="py-2 pe-4">{row.toAddress}</td>
                <td className="py-2 pe-4"><StatusBadge status={row.status} /></td>
                <td className="py-2 pe-4 font-mono text-xs text-muted-foreground">{row.organizationId ?? '—'}</td>
                <td className="py-2 pe-4 text-muted-foreground">
                  {new Date(row.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </td>
                <td className="py-2 text-xs text-destructive max-w-xs truncate">{row.errorMessage ?? ''}</td>
              </tr>
            ))}
            {!isLoading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  {t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={`skeleton-${i}`} className="h-10 animate-pulse rounded bg-muted" />
          ))}
        </div>
      )}

      {nextCursor && !isLoading && (
        <button
          onClick={() => load(nextCursor)}
          className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
        >
          {t('loadMore')}
        </button>
      )}
    </div>
  );
}
