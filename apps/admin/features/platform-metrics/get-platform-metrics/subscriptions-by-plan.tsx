'use client';

import { useTranslations } from 'next-intl';
import { useGetBillingMetrics } from '@/features/billing/get-billing-metrics/use-get-billing-metrics';
import { formatSar } from '@/lib/currency';

function SkeletonRow() {
  return (
    <tr>
      <td className="py-2.5">
        <div className="h-4 w-24 rounded-sm bg-muted animate-pulse" />
      </td>
      <td className="py-2.5 text-end">
        <div className="h-4 w-10 ms-auto rounded-sm bg-muted animate-pulse" />
      </td>
      <td className="py-2.5 text-end">
        <div className="h-4 w-20 ms-auto rounded-sm bg-muted animate-pulse" />
      </td>
      <td className="py-2.5">
        <div className="h-4 w-24 ms-auto rounded-sm bg-muted animate-pulse" />
      </td>
    </tr>
  );
}

export function SubscriptionsByPlan() {
  const t = useTranslations('overview');
  const { data, isLoading, error } = useGetBillingMetrics();

  if (error) {
    return (
      <p className="text-sm text-destructive">{t('byPlan.loadError')}</p>
    );
  }

  const sortedPlans = data
    ? [...data.byPlan].sort((a, b) => Number(b.mrr) - Number(a.mrr))
    : [];

  const totalMrr = data ? Number(data.mrr) : 0;

  return (
    <div>
      <p className="mb-3 text-[11px] uppercase tracking-widest text-muted-foreground">
        {t('byPlan.title')}
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="pb-2.5 text-start text-xs font-medium text-muted-foreground">
              {t('byPlan.plan')}
            </th>
            <th className="pb-2.5 text-end text-xs font-medium text-muted-foreground">
              {t('byPlan.activeCount')}
            </th>
            <th className="pb-2.5 text-end text-xs font-medium text-muted-foreground">
              {t('byPlan.mrr')}
            </th>
            <th className="pb-2.5 pe-0 text-end text-xs font-medium text-muted-foreground">
              {t('byPlan.share')}
            </th>
          </tr>
        </thead>
        <tbody>
          {isLoading || !data ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : sortedPlans.length === 0 ? (
            <tr>
              <td
                colSpan={4}
                className="py-4 text-sm text-muted-foreground text-center"
              >
                {t('byPlan.empty')}
              </td>
            </tr>
          ) : (
            sortedPlans.map((plan) => {
              const pct =
                totalMrr > 0
                  ? Math.round((Number(plan.mrr) / totalMrr) * 100)
                  : 0;
              return (
                <tr
                  key={plan.planId}
                  className="border-b border-border/50 last:border-0"
                >
                  <td className="py-2.5">
                    <span className="font-mono text-xs uppercase tracking-wide">
                      {plan.planSlug}
                    </span>
                  </td>
                  <td className="py-2.5 text-end tabular-nums text-muted-foreground">
                    {plan.activeCount}
                  </td>
                  <td className="py-2.5 text-end font-mono tabular-nums">
                    {formatSar(plan.mrr)}
                  </td>
                  <td className="py-2.5 pe-0">
                    <div className="flex items-center justify-end gap-2">
                      <span className="tabular-nums text-muted-foreground text-xs w-8 text-end">
                        {pct}%
                      </span>
                      <div className="w-16 h-1.5 rounded-full bg-primary/15 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
