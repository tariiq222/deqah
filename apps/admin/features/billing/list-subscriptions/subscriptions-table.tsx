'use client';
// TODO Phase 6.7 follow-up: convert action buttons to icon-only + Tooltip (size-9 rounded-sm)

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
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
import { formatAdminDate } from '@/lib/date';
import type { OrganizationBillingIdentity, SubscriptionRow, SubscriptionStatus } from '../types';

const STATUS_TONE: Record<SubscriptionStatus, string> = {
  ACTIVE: 'border-success/40 bg-success/10 text-success',
  TRIALING: 'border-info/40 bg-info/10 text-info',
  PAST_DUE: 'border-warning/40 bg-warning/10 text-warning',
  SUSPENDED: 'border-destructive/40 bg-destructive/10 text-destructive',
  CANCELED: 'border-destructive/40 bg-destructive/10 text-destructive',
};
const ORG_STATUS_TONE: Record<string, string> = {
  ACTIVE: 'border-success/40 bg-success/10 text-success',
  TRIALING: 'border-primary/40 bg-primary/10 text-primary',
  PAST_DUE: 'border-warning/40 bg-warning/10 text-warning',
  SUSPENDED: 'border-warning/40 bg-warning/10 text-warning',
  ARCHIVED: 'border-muted/40 bg-muted/10 text-muted-foreground',
};

interface Props {
  items: SubscriptionRow[] | undefined;
  isLoading: boolean;
}


export function SubscriptionsTable({ items, isLoading }: Props) {
  const locale = useLocale();
  const t = useTranslations('billing.tables');
  const statusT = useTranslations('billing.subscriptionStatus');
  const orgStatusT = useTranslations('organizations.status');

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('organization')}</TableHead>
          <TableHead>{t('plan')}</TableHead>
          <TableHead>{t('status')}</TableHead>
          <TableHead>{t('cycle')}</TableHead>
          <TableHead>{t('periodEnds')}</TableHead>
          <TableHead>{t('lastPayment')}</TableHead>
          <TableHead className="text-end">{t('actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading && !items
          ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={7}>
                  <Skeleton className="h-6" />
                </TableCell>
              </TableRow>
            ))
          : items?.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <OrganizationCell
                    organization={s.organization}
                    fallbackId={s.organizationId}
                    statusLabel={s.organization ? orgStatusT(s.organization.status) : undefined}
                  />
                </TableCell>
                <TableCell>
                  <div className="font-medium">{s.plan.nameEn}</div>
                  <div className="text-xs text-muted-foreground">
                    {t('priceMonthly', { amount: Number(s.plan.priceMonthly).toFixed(2) })}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={STATUS_TONE[s.status]}>
                    {statusT(s.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{s.billingCycle}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatAdminDate(s.currentPeriodEnd, locale)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatAdminDate(s.lastPaymentAt, locale)}
                </TableCell>
                <TableCell className="text-end">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/billing/${s.organizationId}`}>{t('open')}</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
        {!isLoading && items?.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
              {t('emptySubscriptions')}
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}

function OrganizationCell({
  organization,
  fallbackId,
  statusLabel,
}: {
  organization?: OrganizationBillingIdentity;
  fallbackId: string;
  statusLabel?: string;
}) {
  if (!organization) {
    return <span className="font-mono text-xs text-muted-foreground">{fallbackId.slice(0, 8)}...</span>;
  }

  return (
    <div className="space-y-1">
      <div className="font-medium">{organization.nameAr}</div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {organization.nameEn ? <span>{organization.nameEn}</span> : null}
        <span className="font-mono">{organization.slug}</span>
        <Badge
          variant="outline"
          className={ORG_STATUS_TONE[organization.status] ?? 'border-border bg-muted/10'}
        >
          {statusLabel ?? organization.status}
        </Badge>
      </div>
      <div className="font-mono text-xs text-muted-foreground">{organization.id}</div>
    </div>
  );
}
