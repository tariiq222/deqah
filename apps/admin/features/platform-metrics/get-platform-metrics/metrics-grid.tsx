'use client';

import { useTranslations } from 'next-intl';
import { useGetPlatformMetrics } from './use-get-platform-metrics';
import { formatSar } from '@/lib/currency';

interface KpiCellProps {
  label: string;
  value: string | number;
  tone?: 'success' | 'warning';
}

function KpiCell({ label, value, tone }: KpiCellProps) {
  const numClass = [
    'mt-2 text-[28px] font-semibold leading-none tabular',
    tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="px-5 py-4 first:ps-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </p>
      <p className={numClass}>{value}</p>
    </div>
  );
}

export function MetricsGrid() {
  const t = useTranslations('metrics');
  const { data, isLoading, error } = useGetPlatformMetrics();

  if (error) {
    return (
      <p className="text-sm text-destructive">
        {t('loadError', { message: (error as Error).message })}
      </p>
    );
  }

  if (isLoading || !data) {
    return <div className="animate-pulse h-16 rounded-md bg-muted" />;
  }

  return (
    <div className="flex divide-x divide-border overflow-hidden rounded-md border border-border">
      <KpiCell label={t('kpi.orgs')} value={data.organizations.total} />
      <KpiCell label={t('kpi.active')} value={data.organizations.active} tone="success" />
      <KpiCell label={t('kpi.suspended')} value={data.organizations.suspended} tone="warning" />
      <KpiCell label={t('kpi.newThisMonth')} value={data.organizations.newThisMonth} />
      <KpiCell label={t('kpi.users')} value={data.users.total} />
      <KpiCell label={t('kpi.bookings30d')} value={data.bookings.totalLast30Days} />
      <KpiCell label={t('kpi.lifetimeRevenue')} value={formatSar(data.revenue.lifetimePaidSar)} />
    </div>
  );
}
