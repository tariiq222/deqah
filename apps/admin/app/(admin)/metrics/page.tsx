'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@deqah/ui/primitives/button';
import { MetricsGrid } from '@/features/platform-metrics/get-platform-metrics/metrics-grid';
import { Breadcrumbs } from '@/components/breadcrumbs';

type Range = '24h' | '7d' | '30d' | '90d';
const RANGES: Range[] = ['24h', '7d', '30d', '90d'];

export default function MetricsPage() {
  const pathname = usePathname();
  const t = useTranslations('metrics');
  // Range toggle — UI-only; wire to API when BE supports it
  const [range, setRange] = useState<Range>('30d');

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

        {/* Range toggle — right-aligned in page header */}
        <div className="flex items-center gap-px rounded-md border border-border bg-muted/30 p-0.5">
          {RANGES.map((r) => (
            <Button
              key={r}
              variant="ghost"
              size="sm"
              onClick={() => setRange(r)}
              className={`h-7 px-2.5 text-[12px] tabular-nums rounded-sm ${
                range === r
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(`ranges.${r}`)}
            </Button>
          ))}
        </div>
      </div>

      <MetricsGrid />
    </div>
  );
}
