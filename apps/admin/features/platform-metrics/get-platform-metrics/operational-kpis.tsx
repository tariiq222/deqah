'use client';

import { useTranslations } from 'next-intl';
import { useGetPlatformMetrics } from './use-get-platform-metrics';

function KpiCard({
  label,
  value,
  subLabel,
  subTone,
}: {
  label: string;
  value: string | number;
  subLabel?: string;
  subTone?: 'warning';
}) {
  return (
    <div className="p-4 flex flex-col gap-1">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </p>
      <p className="text-[28px] font-semibold leading-none tabular-nums mt-1 text-foreground">
        {value}
      </p>
      {subLabel ? (
        <p
          className={[
            'text-[11px]',
            subTone === 'warning' ? 'text-warning' : 'text-muted-foreground',
          ].join(' ')}
        >
          {subLabel}
        </p>
      ) : null}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="p-4 flex flex-col gap-2">
      <div className="h-3 w-20 rounded-sm bg-muted animate-pulse" />
      <div className="h-7 w-16 rounded-sm bg-muted animate-pulse" />
      <div className="h-3 w-24 rounded-sm bg-muted animate-pulse" />
    </div>
  );
}

export function OperationalKpis() {
  const t = useTranslations('overview');
  const { data, isLoading, error } = useGetPlatformMetrics();

  if (error) {
    return (
      <p className="text-sm text-destructive">{t('operational.loadError')}</p>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border border-y border-border">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  const { organizations, users, bookings } = data;
  const newPct =
    organizations.total > 0
      ? Math.round((organizations.newThisMonth / organizations.total) * 100)
      : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border border-y border-border">
      <KpiCard
        label={t('operational.activeOrgs')}
        value={organizations.active}
        subLabel={`${organizations.suspended} ${t('operational.suspendedOrgs')}`}
        subTone={organizations.suspended > 0 ? 'warning' : undefined}
      />
      <KpiCard
        label={t('operational.newThisMonth')}
        value={organizations.newThisMonth}
        subLabel={`${newPct}% ${t('operational.ofTotal')} ${organizations.total}`}
      />
      <KpiCard
        label={t('operational.users')}
        value={users.total}
      />
      <KpiCard
        label={t('operational.bookings30d')}
        value={bookings.totalLast30Days}
      />
    </div>
  );
}
