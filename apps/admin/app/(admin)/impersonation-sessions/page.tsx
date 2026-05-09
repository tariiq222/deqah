'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@deqah/ui/primitives/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@deqah/ui/primitives/select';
import { useListImpersonationSessions } from '@/features/impersonation/list-impersonation-sessions/use-list-impersonation-sessions';
import { SessionsTable } from '@/features/impersonation/list-impersonation-sessions/sessions-table';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ErrorBanner } from '@/components/error-banner';

type ActiveFilter = 'all' | 'true' | 'false';

export default function ImpersonationSessionsPage() {
  const pathname = usePathname();
  const t = useTranslations('impersonation');
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<ActiveFilter>('all');

  const { data, isLoading, error, refetch } = useListImpersonationSessions({
    page,
    perPage: 50,
    active: active === 'all' ? undefined : active,
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

        {/* Filter inline in header area */}
        <Select value={active} onValueChange={(v) => { setActive(v as ActiveFilter); setPage(1); }}>
          <SelectTrigger className="h-8 w-[160px] text-[13px]">
            <SelectValue placeholder={t('filters.allSessions')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.allSessions')}</SelectItem>
            <SelectItem value="true">{t('filters.activeOnly')}</SelectItem>
            <SelectItem value="false">{t('filters.endedOrExpired')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <ErrorBanner error={error} onRetry={() => void refetch()} context="page:impersonation-sessions" />
      ) : null}

      <SessionsTable items={data?.items} isLoading={isLoading} />

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
