'use client';

import { useTranslations } from 'next-intl';
import { useGetBillingMetrics } from '@/features/billing/get-billing-metrics/use-get-billing-metrics';
import { formatSar } from '@/lib/currency';

function KpiCard({
  label,
  value,
  subLabel,
  tone,
}: {
  label: string;
  value: string | number;
  subLabel?: string;
  tone?: 'success' | 'warning' | 'destructive';
}) {
  const valueClass = [
    'text-[28px] font-semibold leading-none tabular-nums mt-1',
    tone === 'success'
      ? 'text-success'
      : tone === 'warning'
        ? 'text-warning'
        : tone === 'destructive'
          ? 'text-destructive'
          : 'text-foreground',
  ].join(' ');

  return (
    <div className="p-4 flex flex-col gap-1">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </p>
      <p className={valueClass}>{value}</p>
      {subLabel ? (
        <p className="text-[11px] text-muted-foreground">{subLabel}</p>
      ) : null}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="p-4 flex flex-col gap-2">
      <div className="h-3 w-20 rounded-sm bg-muted animate-pulse" />
      <div className="h-7 w-28 rounded-sm bg-muted animate-pulse" />
      <div className="h-3 w-16 rounded-sm bg-muted animate-pulse" />
    </div>
  );
}

export function FinancialKpis() {
  const t = useTranslations('overview');
  const { data, isLoading, error } = useGetBillingMetrics();

  if (error) {
    return (
      <p className="text-sm text-destructive">{t('financial.loadError')}</p>
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

  const mrrNum = Number(data.mrr);
  const realizedNum = Number(data.realizedMrr);
  const realizedPct =
    mrrNum > 0 ? Math.round((realizedNum / mrrNum) * 100) : 0;

  const atRiskNum = Number(data.atRiskMrr);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border border-y border-border">
      <KpiCard
        label={t('financial.mrr')}
        value={formatSar(data.mrr)}
        subLabel={`${formatSar(data.arr)} ${t('financial.arr')}`}
        tone="success"
      />
      <KpiCard
        label={t('financial.realizedMrr')}
        value={formatSar(data.realizedMrr)}
        subLabel={`${realizedPct}% ${t('financial.ofMrr')}`}
      />
      <KpiCard
        label={t('financial.atRiskMrr')}
        value={formatSar(data.atRiskMrr)}
        subLabel={`${data.counts.SUSPENDED} ${t('financial.suspendedCount')}`}
        tone={atRiskNum > 0 ? 'warning' : undefined}
      />
      <KpiCard
        label={t('financial.churn30d')}
        value={data.churn30d}
        subLabel={`${data.scheduledDowngrades} ${t('financial.scheduledDowngrades')}`}
        tone={data.churn30d > 0 ? 'destructive' : undefined}
      />
    </div>
  );
}
