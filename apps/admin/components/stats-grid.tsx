'use client';
import { Card } from '@deqah/ui/primitives/card';
import { Skeleton } from '@deqah/ui/primitives/skeleton';

export interface StatsGridStat {
  label: string;
  value: number | string;
  variant: 'primary' | 'success' | 'warning' | 'accent';
}

const VARIANT_CLASS: Record<StatsGridStat['variant'], string> = {
  primary: 'border-primary/20 bg-primary/5',
  success: 'border-success/20 bg-success/5',
  warning: 'border-warning/20 bg-warning/5',
  accent: 'border-accent/20 bg-accent/5',
};

export function StatsGrid({
  stats,
  isLoading,
}: {
  stats: StatsGridStat[];
  isLoading?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s, i) => (
        <Card key={i} className={`p-4 ${VARIANT_CLASS[s.variant]}`}>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {isLoading ? <Skeleton className="h-7 w-16" /> : s.value}
          </div>
        </Card>
      ))}
    </div>
  );
}
