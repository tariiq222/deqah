'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@deqah/ui/primitives/card';
import { Skeleton } from '@deqah/ui/primitives/skeleton';
import { useGetBillingMetrics } from './use-get-billing-metrics';
import { formatSar } from '@/lib/currency';

export function BillingMetricsGrid() {
  const { data, isLoading, error } = useGetBillingMetrics();

  if (error) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="p-4 text-sm text-destructive">
          Failed to load billing metrics: {(error as Error).message}
        </CardContent>
      </Card>
    );
  }

  const isEmpty = data && Number(data.mrr) === 0 && data.counts.ACTIVE === 0 && data.counts.TRIALING === 0;

  return (
    <div className="space-y-6">
      {isEmpty && !isLoading && (
        <div className="rounded-lg border border-muted bg-muted/10 p-4 text-center text-sm text-muted-foreground">
          No subscriptions yet — MRR will appear once organizations subscribe to a plan.
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {isLoading || !data ? (
          <>
            <Skeleton className="h-[100px]" />
            <Skeleton className="h-[100px]" />
            <Skeleton className="h-[100px]" />
            <Skeleton className="h-[100px]" />
          </>
        ) : (
          <>
            <MetricCard label="Committed MRR (⃁)" value={formatSar(data.mrr)} tone="success" />
            <MetricCard label="Realized MRR (⃁)" value={formatSar(data.realizedMrr)} />
            <MetricCard label="Active subs" value={data.counts.ACTIVE} />
            <MetricCard label="Past due" value={data.counts.PAST_DUE} tone="warning" />
          </>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {isLoading || !data ? (
          <>
            <Skeleton className="h-[100px]" />
            <Skeleton className="h-[100px]" />
            <Skeleton className="h-[100px]" />
            <Skeleton className="h-[100px]" />
          </>
        ) : (
          <>
            <MetricCard label="ARR (⃁)" value={formatSar(data.arr)} tone="success" />
            <MetricCard label="Trialing" value={data.counts.TRIALING} />
            <MetricCard label="Suspended" value={data.counts.SUSPENDED} tone="warning" />
            <MetricCard label="At-risk MRR (⃁)" value={formatSar(data.atRiskMrr)} tone="warning" />
          </>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {isLoading || !data ? (
          <>
            <Skeleton className="h-[100px]" />
            <Skeleton className="h-[100px]" />
            <Skeleton className="h-[100px]" />
          </>
        ) : (
          <>
            <MetricCard label="Churn (30d)" value={data.churn30d} tone="warning" />
            <MetricCard label="Scheduled downgrades" value={data.scheduledDowngrades} tone="warning" />
            <MetricCard label="Canceled" value={data.counts.CANCELED} tone="warning" />
          </>
        )}
      </div>

      {data && data.byPlan.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">MRR by plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.byPlan.map((p) => (
              <PlanBar
                key={p.planId}
                slug={p.planSlug}
                count={p.activeCount}
                mrr={p.mrr}
                total={data.mrr}
              />
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: 'success' | 'warning';
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <span
          className={
            tone === 'success'
              ? 'text-2xl font-semibold text-success'
              : tone === 'warning'
                ? 'text-2xl font-semibold text-warning'
                : 'text-2xl font-semibold'
          }
        >
          {value}
        </span>
      </CardContent>
    </Card>
  );
}

function PlanBar({
  slug,
  count,
  mrr,
  total,
}: {
  slug: string;
  count: number;
  mrr: string;
  total: string;
}) {
  const totalNum = Number(total);
  const pct = totalNum === 0 ? 0 : Math.round((Number(mrr) / totalNum) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium">
          {slug} <span className="text-muted-foreground">({count} active)</span>
        </span>
        <span className="text-muted-foreground">
          {formatSar(mrr)} ({pct}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
