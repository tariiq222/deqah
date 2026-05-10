import { getTranslations } from 'next-intl/server';
import { FinancialKpis } from '@/features/platform-metrics/get-platform-metrics/financial-kpis';
import { OperationalKpis } from '@/features/platform-metrics/get-platform-metrics/operational-kpis';
import { SubscriptionsByPlan } from '@/features/platform-metrics/get-platform-metrics/subscriptions-by-plan';
import { SubscriptionStatusDistribution } from '@/features/platform-metrics/get-platform-metrics/subscription-status-distribution';
import { QuickActions } from '@/features/platform-metrics/get-platform-metrics/quick-actions';

export default async function OverviewPage() {
  const t = await getTranslations('overview');
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <span className="mono text-[11px] text-muted-foreground">{now}</span>
      </div>

      {/* Section 1: Financial KPIs */}
      <FinancialKpis />

      {/* Section 2: Operational KPIs */}
      <OperationalKpis />

      {/* Section 3 & 4: Subscriptions by Plan + Status Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <SubscriptionsByPlan />
        <SubscriptionStatusDistribution />
      </div>

      {/* Section 5: Quick Actions */}
      <QuickActions />
    </div>
  );
}
