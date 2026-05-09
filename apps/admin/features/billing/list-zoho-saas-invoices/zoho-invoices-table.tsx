'use client';

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
import type { ZohoSaasInvoiceRow } from './list-zoho-saas-invoices.api';

const INV_TONE: Record<string, string> = {
  PAID: 'border-success/40 bg-success/10 text-success',
  DUE: 'border-muted bg-muted text-muted-foreground',
  FAILED: 'border-warning/40 bg-warning/10 text-warning',
  VOID: 'border-destructive/40 bg-destructive/10 text-destructive',
  DRAFT: 'border-muted bg-muted text-muted-foreground',
};

const ZOHO_TONE: Record<string, string> = {
  paid: 'border-success/40 bg-success/10 text-success',
  sent: 'border-primary/40 bg-primary/10 text-primary',
  void: 'border-destructive/40 bg-destructive/10 text-destructive',
  overdue: 'border-warning/40 bg-warning/10 text-warning',
  partially_paid: 'border-warning/40 bg-warning/10 text-warning',
};

interface Props {
  items: ZohoSaasInvoiceRow[] | undefined;
  isLoading: boolean;
}

export function ZohoInvoicesTable({ items, isLoading }: Props) {
  const locale = useLocale();
  const t = useTranslations('billing');
  const tc = useTranslations('common');

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={`skeleton-${i}`} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!items?.length) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">{/* TODO i18n: No invoices found */}No invoices found.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{/* TODO i18n: Tenant */}Tenant</TableHead>
            <TableHead>{t('tables.invoice')}</TableHead>
            <TableHead>{t('tables.period')}</TableHead>
            <TableHead>{/* TODO i18n: Cycle */}Cycle</TableHead>
            <TableHead className="text-right">{/* TODO i18n: Amount */}Amount</TableHead>
            <TableHead>{tc('status')}</TableHead>
            <TableHead>{/* TODO i18n: Zoho mirror */}Zoho mirror</TableHead>
            <TableHead>{/* TODO i18n: Next charge */}Next charge</TableHead>
            <TableHead className="text-end">{tc('actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <div className="space-y-0.5">
                  <Link
                    href={`/billing/${row.organizationId}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {row.organization.nameAr || row.organization.nameEn || row.organization.slug}
                  </Link>
                  <p className="font-mono text-xs text-muted-foreground">{row.organization.slug}</p>
                </div>
              </TableCell>
              <TableCell>
                <span className="font-mono text-xs">
                  {row.invoiceNumber ?? row.id.slice(0, 8) + '…'}
                </span>
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                {formatAdminDate(row.periodStart, locale)} → {formatAdminDate(row.periodEnd, locale)}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {row.billingCycle}
              </TableCell>
              <TableCell className="text-right">
                <span className="tabular-nums font-mono text-sm">
                  {Number(row.amount).toFixed(2)}
                </span>
                <span className="ml-1 text-xs text-muted-foreground">{row.currency}</span>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={INV_TONE[row.status]}>
                  {t(`invoiceStatus.${row.status}`)}
                </Badge>
              </TableCell>
              <TableCell>
                {row.zohoMirror ? (
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={ZOHO_TONE[row.zohoMirror.status] ?? 'border-muted'}
                    >
                      {row.zohoMirror.status}
                    </Badge>
                    {row.zohoMirror.viewedAt ? (
                      <span className="font-mono text-xs text-muted-foreground">viewed</span>
                    ) : null}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                {row.subscriptionStatus === 'ACTIVE' || row.subscriptionStatus === 'TRIALING'
                  ? formatAdminDate(row.nextChargeAt, locale)
                  : '—'}
              </TableCell>
              <TableCell className="text-end">
                {row.zohoMirror?.invoiceUrl ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={row.zohoMirror.invoiceUrl} target="_blank" rel="noopener noreferrer">
                      Zoho ↗
                    </a>
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
