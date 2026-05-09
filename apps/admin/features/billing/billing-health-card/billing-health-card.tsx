'use client';

import { Badge } from '@deqah/ui/primitives/badge';
import { Button } from '@deqah/ui/primitives/button';
import { Card, CardContent, CardHeader, CardTitle } from '@deqah/ui/primitives/card';
import { formatAdminDate } from '@/lib/date';
import type { DunningLogRow, SubscriptionRow } from '../types';
import { useForceCharge } from '../force-charge/use-force-charge';
import { useCancelScheduled } from '../cancel-scheduled/use-cancel-scheduled';

const SUB_TONE: Record<string, string> = {
  ACTIVE: 'border-success/40 bg-success/10 text-success',
  TRIALING: 'border-info/40 bg-info/10 text-info',
  PAST_DUE: 'border-warning/40 bg-warning/10 text-warning',
  SUSPENDED: 'border-destructive/40 bg-destructive/10 text-destructive',
  CANCELED: 'border-destructive/40 bg-destructive/10 text-destructive',
};

const DUNNING_TONE: Record<string, string> = {
  SUCCEEDED: 'border-success/40 bg-success/10 text-success',
  FAILED: 'border-destructive/40 bg-destructive/10 text-destructive',
  SKIPPED: 'border-muted bg-muted text-muted-foreground',
};


interface Props {
  orgId: string;
  subscription: SubscriptionRow & { plan: { slug: string; nameEn: string; priceMonthly: string | number } };
  dunningLogs: DunningLogRow[];
}

export function BillingHealthCard({ orgId, subscription, dunningLogs }: Props) {
  // TODO i18n: strings below have no billing.* JSON keys yet:
  // 'Billing Health', 'Cancels at period end', 'Attempts', 'Last attempt',
  // 'Last result', 'Scheduled for', 'Charging…', 'Force charge now',
  // 'Reversing…', 'Cancel scheduled cancellation'
  const forceCharge = useForceCharge(orgId);
  const cancelScheduled = useCancelScheduled(orgId);

  const isPastDue = subscription.status === 'PAST_DUE';
  const isSuspended = subscription.status === 'SUSPENDED';
  const latestLog = dunningLogs[0] ?? null;
  const showDunning = isPastDue || isSuspended || latestLog !== null;

  const cardClass =
    isPastDue
      ? 'border-warning/40 bg-warning/5'
      : isSuspended
        ? 'border-destructive/40 bg-destructive/5'
        : 'border-border';

  return (
    <Card className={cardClass}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-3 text-base">
          Billing Health
          <Badge variant="outline" className={SUB_TONE[subscription.status] ?? ''}>
            {subscription.status.replace('_', ' ')}
          </Badge>
          {subscription.cancelAtPeriodEnd ? (
            <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">
              Cancels at period end
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {showDunning ? (
          <div className="grid grid-cols-2 gap-3 rounded-md border border-border p-3 text-sm md:grid-cols-4">
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Attempts</p>
              <p className="font-medium">{dunningLogs.length}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Last attempt</p>
              <p className="font-medium">{latestLog ? formatAdminDate(latestLog.executedAt, 'en') : '—'}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Last result</p>
              {latestLog ? (
                <Badge variant="outline" className={DUNNING_TONE[latestLog.status] ?? ''}>
                  {latestLog.status}
                </Badge>
              ) : (
                <p>—</p>
              )}
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Scheduled for</p>
              <p className="font-medium">{latestLog ? formatAdminDate(latestLog.scheduledFor, 'en') : '—'}</p>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {isPastDue ? (
            <Button
              variant="outline"
              size="sm"
              className="border-warning/60 text-warning hover:bg-warning/10"
              onClick={() => forceCharge.mutate()}
              disabled={forceCharge.isPending}
            >
              {forceCharge.isPending ? 'Charging…' : 'Force charge now'}
            </Button>
          ) : null}
          {subscription.cancelAtPeriodEnd ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => cancelScheduled.mutate()}
              disabled={cancelScheduled.isPending}
            >
              {cancelScheduled.isPending ? 'Reversing…' : 'Cancel scheduled cancellation'}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
