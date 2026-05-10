'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { ExternalLink, FileDown } from 'lucide-react';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@deqah/ui/primitives/tooltip';
import { formatAdminDate } from '@/lib/date';
import type {
  OrganizationBillingIdentity,
  SubscriptionInvoiceRow,
  SubscriptionInvoiceStatus,
} from '../types';

const STATUS_TONE: Record<SubscriptionInvoiceStatus, string> = {
  PAID: 'border-success/40 bg-success/10 text-success',
  DUE: 'border-muted bg-muted text-muted-foreground',
  FAILED: 'border-warning/40 bg-warning/10 text-warning',
  VOID: 'border-destructive/40 bg-destructive/10 text-destructive',
  DRAFT: 'border-muted bg-muted text-muted-foreground',
};

const ORG_STATUS_TONE: Record<string, string> = {
  ACTIVE: 'border-success/40 bg-success/10 text-success',
  TRIALING: 'border-primary/40 bg-primary/10 text-primary',
  PAST_DUE: 'border-warning/40 bg-warning/10 text-warning',
  SUSPENDED: 'border-warning/40 bg-warning/10 text-warning',
  ARCHIVED: 'border-muted/40 bg-muted/10 text-muted-foreground',
};

interface Props {
  items: SubscriptionInvoiceRow[] | undefined;
  isLoading: boolean;
}

export function InvoicesTable({ items, isLoading }: Props) {
  const locale = useLocale();
  const t = useTranslations('billing.tables');
  const statusT = useTranslations('billing.invoiceStatus');
  const orgStatusT = useTranslations('organizations.status');

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('invoice')}</TableHead>
          <TableHead>{t('organization')}</TableHead>
          <TableHead className="text-right">{t('amountSar')}</TableHead>
          <TableHead className="text-right">{t('refunded')}</TableHead>
          <TableHead>{t('status')}</TableHead>
          <TableHead>{t('period')}</TableHead>
          <TableHead>{t('due')}</TableHead>
          <TableHead className="text-end">{t('actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading && !items
          ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={`skeleton-row-${i}`}>
                <TableCell colSpan={8}>
                  <Skeleton className="h-5" />
                </TableCell>
              </TableRow>
            ))
          : items?.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-mono text-xs">{inv.id.slice(0, 8)}…</TableCell>
                <TableCell>
                  <OrgCell
                    organization={inv.organization}
                    fallbackId={inv.organizationId}
                    statusLabel={inv.organization ? orgStatusT(inv.organization.status) : undefined}
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums font-mono text-sm">
                  {Number(inv.amount).toFixed(2)}
                  <span className="ml-1 text-xs text-muted-foreground">SAR</span>
                </TableCell>
                <TableCell className="text-right tabular-nums font-mono text-sm text-muted-foreground">
                  {inv.refundedAmount ? `−${Number(inv.refundedAmount).toFixed(2)}` : '—'}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={STATUS_TONE[inv.status]}>
                    {statusT(inv.status)}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {formatAdminDate(inv.periodStart, locale)} → {formatAdminDate(inv.periodEnd, locale)}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {formatAdminDate(inv.dueDate, locale)}
                </TableCell>
                <TableCell className="text-end">
                  <div className="flex items-center justify-end gap-1">
                    {inv.zohoInvoiceUrl ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button asChild variant="ghost" size="icon" className="size-9 rounded-sm">
                              <a href={inv.zohoInvoiceUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="size-4" />
                                <span className="sr-only">{t('viewInZoho')}</span>
                              </a>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('viewInZoho')}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : null}
                    {inv.zohoPdfUrl ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button asChild variant="ghost" size="icon" className="size-9 rounded-sm">
                              <a href={inv.zohoPdfUrl} target="_blank" rel="noopener noreferrer">
                                <FileDown className="size-4" />
                                <span className="sr-only">{t('downloadPdf')}</span>
                              </a>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('downloadPdf')}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : null}
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/billing/${inv.organizationId}`}>{t('open')}</Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
        {!isLoading && items?.length === 0 ? (
          <TableRow>
            <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
              {t('emptyInvoices')}
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}

function OrgCell({
  organization,
  fallbackId,
  statusLabel,
}: {
  organization?: OrganizationBillingIdentity;
  fallbackId: string;
  statusLabel?: string;
}) {
  if (!organization) {
    return (
      <span className="font-mono text-xs text-muted-foreground">{fallbackId.slice(0, 8)}…</span>
    );
  }

  return (
    <div className="space-y-0.5">
      <div className="font-medium text-sm">{organization.nameAr}</div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {organization.nameEn ? <span>{organization.nameEn}</span> : null}
        <span className="font-mono">{organization.slug}</span>
        <Badge
          variant="outline"
          className={ORG_STATUS_TONE[organization.status] ?? 'border-border bg-muted/10'}
        >
          {statusLabel ?? organization.status}
        </Badge>
      </div>
    </div>
  );
}
