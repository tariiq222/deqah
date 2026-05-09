'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@deqah/ui/primitives/badge';
import { Button } from '@deqah/ui/primitives/button';
import { Skeleton } from '@deqah/ui/primitives/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@deqah/ui/primitives/table';
import type {
  DunningLogRow,
  SubscriptionInvoiceRow,
  SubscriptionInvoiceStatus,
  SubscriptionStatus,
} from '../types';
import { ChangePlanDialog } from '../change-plan-for-org/change-plan-dialog';
import { GrantCreditDialog } from '../grant-credit/grant-credit-dialog';
import { RefundInvoiceDialog } from '../refund-invoice/refund-invoice-dialog';
import { WaiveInvoiceDialog } from '../waive-invoice/waive-invoice-dialog';
import { BillingHealthCard } from '../billing-health-card/billing-health-card';
import { formatAdminDate, formatAdminDateTime } from '@/lib/date';
import { useGetOrgBilling } from './use-get-org-billing';

const WAIVABLE: SubscriptionInvoiceStatus[] = ['DUE', 'FAILED'];

function isFullyRefunded(inv: SubscriptionInvoiceRow): boolean {
  if (inv.refundedAmount === null) return false;
  return Number(inv.refundedAmount) >= Number(inv.amount);
}

const SUB_TONE: Record<SubscriptionStatus, string> = {
  ACTIVE: 'border-success/40 bg-success/10 text-success',
  TRIALING: 'border-info/40 bg-info/10 text-info',
  PAST_DUE: 'border-warning/40 bg-warning/10 text-warning',
  SUSPENDED: 'border-destructive/40 bg-destructive/10 text-destructive',
  CANCELED: 'border-destructive/40 bg-destructive/10 text-destructive',
};

const INV_TONE: Record<SubscriptionInvoiceStatus, string> = {
  PAID: 'border-success/40 bg-success/10 text-success',
  DUE: 'border-muted bg-muted text-muted-foreground',
  FAILED: 'border-warning/40 bg-warning/10 text-warning',
  VOID: 'border-destructive/40 bg-destructive/10 text-destructive',
  DRAFT: 'border-muted bg-muted text-muted-foreground',
};

interface Props {
  orgId: string;
}

export function OrgBillingDetail({ orgId }: Props) {
  const t = useTranslations('billing');
  const tc = useTranslations('common');
  const { data, isLoading, error } = useGetOrgBilling(orgId);
  const [waiveTarget, setWaiveTarget] = useState<SubscriptionInvoiceRow | null>(null);
  const [refundTarget, setRefundTarget] = useState<SubscriptionInvoiceRow | null>(null);
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [grantCreditOpen, setGrantCreditOpen] = useState(false);

  if (error) {
    return (
      <p className="text-sm text-destructive">
        {/* TODO i18n: Failed to load */}
        Failed to load: {(error as Error).message}
      </p>
    );
  }

  if (isLoading || !data) return <Skeleton className="h-[400px]" />;

  const dunningLogs: DunningLogRow[] = data.dunningLogs ?? [];
  const sub = data.subscription;

  return (
    <div className="space-y-0">
      {/* Subscription summary — dense two-column definition list */}
      {sub ? (
        <section className="pb-12">
          <BillingHealthCard orgId={orgId} subscription={sub} dunningLogs={dunningLogs} />

          <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-4 text-sm md:grid-cols-3">
            <SummaryField label={t('detail.plan')}>
              <span className="font-mono text-xs uppercase tracking-wide">{sub.plan.slug}</span>
              {' — '}
              {sub.plan.nameEn}
            </SummaryField>
            <SummaryField label={t('detail.status')}>
              <Badge variant="outline" className={SUB_TONE[sub.status]}>
                {sub.status.replace('_', ' ')}
              </Badge>
            </SummaryField>
            <SummaryField label={t('detail.cycle')}>{sub.billingCycle}</SummaryField>
            <SummaryField label={t('detail.period')}>
              <span className="font-mono text-xs">
                {formatAdminDate(sub.currentPeriodStart, 'en')} →{' '}
                {formatAdminDate(sub.currentPeriodEnd, 'en')}
              </span>
            </SummaryField>
            <SummaryField label={t('detail.mrr')}>
              <span className="tabular-nums font-mono">
                {Number(sub.plan.priceMonthly).toFixed(2)}{' '}
                <span className="text-xs text-muted-foreground">SAR/mo</span>
              </span>
            </SummaryField>
            <SummaryField label={t('detail.lastPayment')}>
              <span className="font-mono text-xs">{formatAdminDate(sub.lastPaymentAt, 'en')}</span>
            </SummaryField>
            {sub.trialEndsAt ? (
              <SummaryField label={t('detail.trialEnds')}>
                <span className="font-mono text-xs">{formatAdminDate(sub.trialEndsAt, 'en')}</span>
              </SummaryField>
            ) : null}
            {sub.pastDueSince ? (
              <SummaryField label={t('detail.pastDueSince')}>
                <span className="font-mono text-xs text-warning">
                  {formatAdminDate(sub.pastDueSince, 'en')}
                </span>
              </SummaryField>
            ) : null}
            {sub.lastFailureReason ? (
              <SummaryField label={t('detail.lastFailure')}>
                <span className="text-destructive">{sub.lastFailureReason}</span>
              </SummaryField>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="pb-12">
          <p className="text-sm text-muted-foreground">{t('detail.noSubscription')}</p>
        </section>
      )}

      {/* Recent invoices */}
      <section className="border-t border-border pt-12 pb-12">
        <SectionHeader title={t('detail.recentInvoices')} count={data.invoices.length}>
          {sub ? (
            <Button variant="ghost" size="sm" onClick={() => setChangePlanOpen(true)}>
              {t('detail.changePlanButton')}
            </Button>
          ) : null}
        </SectionHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('tables.invoice')}</TableHead>
              <TableHead>{t('tables.amountSar')}</TableHead>
              <TableHead>{t('tables.refunded')}</TableHead>
              <TableHead>{t('tables.status')}</TableHead>
              <TableHead>{t('tables.period')}</TableHead>
              <TableHead>{t('tables.due')}</TableHead>
              <TableHead className="text-right">{tc('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  {t('detail.noInvoices')}
                </TableCell>
              </TableRow>
            ) : (
              data.invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-xs">{inv.id.slice(0, 8)}…</TableCell>
                  <TableCell className="tabular-nums font-mono text-sm">
                    {Number(inv.amount).toFixed(2)}{' '}
                    <span className="text-xs text-muted-foreground">{inv.currency}</span>
                  </TableCell>
                  <TableCell className="tabular-nums font-mono text-sm text-muted-foreground">
                    {inv.refundedAmount ? `−${Number(inv.refundedAmount).toFixed(2)}` : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={INV_TONE[inv.status]}>
                      {inv.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {formatAdminDate(inv.periodStart, 'en')} → {formatAdminDate(inv.periodEnd, 'en')}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {formatAdminDate(inv.dueDate, 'en')}
                  </TableCell>
                  <TableCell className="text-right">
                    {WAIVABLE.includes(inv.status) ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setWaiveTarget(inv)}
                      >
                        {t('detail.waiveButton')}
                      </Button>
                    ) : inv.status === 'PAID' && !isFullyRefunded(inv) ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setRefundTarget(inv)}
                      >
                        {t('detail.refundButton')}
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      {/* Credits */}
      <section className="border-t border-border pt-12 pb-12">
        <SectionHeader title={t('detail.credits')} count={data.credits.length}>
          <Button variant="ghost" size="sm" onClick={() => setGrantCreditOpen(true)}>
            {t('detail.grantCreditButton')}
          </Button>
        </SectionHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('tables.amountSar')}</TableHead>
              <TableHead>{t('detail.creditReason')}</TableHead>
              <TableHead>{t('detail.creditGranted')}</TableHead>
              <TableHead>{t('detail.creditConsumed')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.credits.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  {t('detail.noCredits')}
                </TableCell>
              </TableRow>
            ) : (
              data.credits.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="tabular-nums font-mono text-sm">
                    {Number(c.amount).toFixed(2)}{' '}
                    <span className="text-xs text-muted-foreground">{c.currency}</span>
                  </TableCell>
                  <TableCell className="text-sm">{c.reason ?? '—'}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {formatAdminDate(c.grantedAt, 'en')}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {c.consumedAt ? formatAdminDate(c.consumedAt, 'en') : t('detail.creditUnused')}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      {/* Usage */}
      <section className="border-t border-border pt-12 pb-12">
        <SectionHeader title={t('detail.usage')} count={data.usage.length} />
        {data.usage.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('detail.noUsage')}</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {data.usage.map((u) => (
                <tr key={`${u.metric}-${u.periodStart}`} className="border-b border-border/50 last:border-0">
                  <td className="py-2 font-medium">{u.metric.replace(/_/g, ' ')}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{u.count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Dunning audit trail */}
      {dunningLogs.length > 0 ? (
        <section className="border-t border-border pt-12 pb-12">
          <SectionHeader title={t('detail.dunningAttempts')} count={dunningLogs.length} />
          <ol className="space-y-3">
            {dunningLogs.map((log) => (
              <li key={log.id} className="flex items-start gap-4 text-sm">
                <span className="font-mono text-xs text-muted-foreground w-20 shrink-0 pt-0.5">
                  {formatAdminDateTime(log.executedAt)}
                </span>
                <span className="text-muted-foreground shrink-0">#{log.attemptNumber}</span>
                <Badge
                  variant="outline"
                  className={
                    log.status === 'succeeded'
                      ? 'border-success/40 bg-success/10 text-success shrink-0'
                      : log.status === 'failed'
                        ? 'border-destructive/40 bg-destructive/10 text-destructive shrink-0'
                        : 'border-muted bg-muted text-muted-foreground shrink-0'
                  }
                >
                  {log.status}
                </Badge>
                {log.failureReason ? (
                  <span className="text-muted-foreground">{log.failureReason}</span>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* Sheets */}
      {waiveTarget ? (
        <WaiveInvoiceDialog
          open={Boolean(waiveTarget)}
          onOpenChange={(o) => !o && setWaiveTarget(null)}
          invoice={waiveTarget}
          orgId={orgId}
        />
      ) : null}

      {refundTarget ? (
        <RefundInvoiceDialog
          open={Boolean(refundTarget)}
          onOpenChange={(o) => !o && setRefundTarget(null)}
          invoice={refundTarget}
          orgId={orgId}
        />
      ) : null}

      <GrantCreditDialog
        open={grantCreditOpen}
        onOpenChange={setGrantCreditOpen}
        organizationId={orgId}
      />

      {sub ? (
        <ChangePlanDialog
          open={changePlanOpen}
          onOpenChange={setChangePlanOpen}
          organizationId={orgId}
          currentPlanId={sub.planId}
          currentPlanLabel={`${sub.plan.nameEn} (${sub.plan.slug}) · ${Number(sub.plan.priceMonthly).toFixed(2)} SAR/mo`}
        />
      ) : null}
    </div>
  );
}

function SummaryField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function SectionHeader({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h3 className="text-sm font-semibold">
        {title}
        {count !== undefined ? (
          <span className="ml-2 font-mono text-xs text-muted-foreground">({count})</span>
        ) : null}
      </h3>
      {children}
    </div>
  );
}
