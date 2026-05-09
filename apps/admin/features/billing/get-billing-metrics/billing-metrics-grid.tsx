'use client';

import { useTranslations } from 'next-intl';
import { Skeleton } from '@deqah/ui/primitives/skeleton';
import { useGetBillingMetrics } from './use-get-billing-metrics';
import { formatSar } from '@/lib/currency';

interface KpiCell {
  label: string;
  value: string | number;
  tone?: 'success' | 'warning';
  mono?: boolean;
}

export function BillingMetricsGrid() {
  const t = useTranslations('billing');
  const { data, isLoading, error } = useGetBillingMetrics();

  if (error) {
    return (
      <p className="text-sm text-destructive">
        {t('metrics.loadError', { message: (error as Error).message })}
      </p>
    );
  }

  if (isLoading || !data) {
    return <Skeleton className="h-[88px] w-full rounded-sm" />;
  }

  const isEmpty =
    Number(data.mrr) === 0 &&
    data.counts.ACTIVE === 0 &&
    data.counts.TRIALING === 0;

  const cells: KpiCell[] = [
    { label: 'Committed MRR', value: formatSar(data.mrr), tone: 'success', mono: true }, // TODO i18n: Committed MRR
    { label: 'Realized MRR', value: formatSar(data.realizedMrr), mono: true }, // TODO i18n: Realized MRR
    { label: t('metrics.arr'), value: formatSar(data.arr), tone: 'success', mono: true },
    { label: t('metrics.activeSubscriptions'), value: data.counts.ACTIVE },
    { label: t('metrics.trialingSubscriptions'), value: data.counts.TRIALING },
    { label: t('metrics.pastDueSubscriptions'), value: data.counts.PAST_DUE, tone: 'warning' },
    { label: 'Suspended', value: data.counts.SUSPENDED, tone: 'warning' }, // TODO i18n: Suspended
    { label: 'At-risk MRR', value: formatSar(data.atRiskMrr), tone: 'warning', mono: true }, // TODO i18n: At-risk MRR
    { label: 'Churn 30d', value: data.churn30d, tone: 'warning' }, // TODO i18n: Churn 30d
  ];

  return (
    <div className="space-y-6">
      {isEmpty && (
        <p className="text-sm text-muted-foreground">
          {/* TODO i18n: No subscriptions yet. MRR will appear once organizations subscribe to a plan. */}
          No subscriptions yet. MRR will appear once organizations subscribe to a plan.
        </p>
      )}

      {/* KPI strip — vertical hairlines between cells, no card wrappers */}
      <div className="flex overflow-x-auto rounded-sm border border-border">
        {cells.map((cell, i) => (
          <div
            key={cell.label}
            className={[
              'flex min-w-[120px] flex-1 flex-col gap-1.5 px-5 py-4',
              i > 0 ? 'border-s border-border' : '',
            ].join(' ')}
          >
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground whitespace-nowrap">
              {cell.label}
            </p>
            <p
              className={[
                'text-xl font-semibold tabular-nums leading-none',
                cell.mono ? 'font-mono' : '',
                cell.tone === 'success'
                  ? 'text-success'
                  : cell.tone === 'warning'
                    ? 'text-warning'
                    : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {cell.value}
            </p>
          </div>
        ))}
      </div>

      {/* MRR by plan — bare table, no card wrapper */}
      {data.byPlan.length > 0 ? (
        <div>
          <p className="mb-3 text-[11px] uppercase tracking-widest text-muted-foreground">
            MRR by plan
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-2 text-start text-xs font-medium text-muted-foreground">Plan</th>
                <th className="pb-2 text-end text-xs font-medium text-muted-foreground">Active</th>
                <th className="pb-2 text-end text-xs font-medium text-muted-foreground">MRR</th>
                <th className="pb-2 text-end text-xs font-medium text-muted-foreground">Share</th>
              </tr>
            </thead>
            <tbody>
              {data.byPlan.map((p) => {
                const totalNum = Number(data.mrr);
                const pct =
                  totalNum === 0
                    ? 0
                    : Math.round((Number(p.mrr) / totalNum) * 100);
                return (
                  <tr key={p.planId} className="border-b border-border/50 last:border-0">
                    <td className="py-2">
                      <span className="font-mono text-xs uppercase tracking-wide">
                        {p.planSlug}
                      </span>
                    </td>
                    <td className="py-2 text-end tabular-nums text-muted-foreground">
                      {p.activeCount}
                    </td>
                    <td className="py-2 text-end font-mono tabular-nums">
                      {formatSar(p.mrr)}
                    </td>
                    <td className="py-2 text-end tabular-nums text-muted-foreground">
                      {pct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
