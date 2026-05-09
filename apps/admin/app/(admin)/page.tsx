import { getTranslations } from 'next-intl/server';
import { MetricsGrid } from '@/features/platform-metrics/get-platform-metrics/metrics-grid';

export default async function OverviewPage() {
  const t = await getTranslations('overview');
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[22px] font-semibold tracking-tight">{t('title')}</h1>
        <span className="mono text-[11px] text-muted-foreground">{now}</span>
      </div>

      <MetricsGrid />
    </div>
  );
}
