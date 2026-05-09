'use client';

import { useTranslations } from 'next-intl';
import { BillingMetricsGrid } from '@/features/billing/get-billing-metrics/billing-metrics-grid';

export default function BillingMetricsPage() {
  const t = useTranslations('billing');
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{t('metrics.title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('metrics.description')}
        </p>
      </div>
      <BillingMetricsGrid />
    </div>
  );
}
