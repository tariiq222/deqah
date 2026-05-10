'use client';

import { useTranslations } from 'next-intl';
import { useGetBillingMetrics } from '@/features/billing/get-billing-metrics/use-get-billing-metrics';
import type { SubscriptionStatus } from '@/features/billing/types';

const STATUS_ORDER: SubscriptionStatus[] = [
  'ACTIVE',
  'TRIALING',
  'PAST_DUE',
  'SUSPENDED',
  'CANCELED',
];

const STATUS_CLASSES: Record<SubscriptionStatus, string> = {
  ACTIVE: 'bg-success/10 text-success border-success/30',
  TRIALING: 'bg-primary/10 text-primary border-primary/30',
  PAST_DUE: 'bg-warning/10 text-warning border-warning/30',
  SUSPENDED: 'bg-warning/10 text-warning border-warning/30',
  CANCELED: 'bg-muted text-muted-foreground border-border',
};

export function SubscriptionStatusDistribution() {
  const t = useTranslations('overview');
  const { data, isLoading, error } = useGetBillingMetrics();

  if (error) {
    return (
      <p className="text-sm text-destructive">{t('statusDist.loadError')}</p>
    );
  }

  return (
    <div>
      <p className="mb-3 text-[11px] uppercase tracking-widest text-muted-foreground">
        {t('statusDist.title')}
      </p>
      <div className="flex flex-wrap gap-2">
        {isLoading || !data ? (
          <>
            {STATUS_ORDER.map((s) => (
              <div
                key={s}
                className="h-8 w-24 rounded-full bg-muted animate-pulse"
              />
            ))}
          </>
        ) : (
          STATUS_ORDER.map((status) => {
            const count = data.counts[status] ?? 0;
            return (
              <span
                key={status}
                className={[
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium',
                  STATUS_CLASSES[status],
                ].join(' ')}
              >
                <span className="tabular-nums font-semibold">{count}</span>
                <span>{t(`statusDist.${status}`)}</span>
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}
