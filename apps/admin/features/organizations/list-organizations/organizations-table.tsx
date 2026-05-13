'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { ExternalLink } from 'lucide-react';
import { Skeleton } from '@deqah/ui/primitives/skeleton';
import { Button } from '@deqah/ui/primitives/button';
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
import type { OrganizationRow } from '../types';

interface Props {
  items: OrganizationRow[] | undefined;
  isLoading: boolean;
}

const STATUS_DOT: Record<string, string> = {
  TRIALING: 'bg-primary',
  ACTIVE: 'bg-success',
  PAST_DUE: 'bg-warning',
  SUSPENDED: 'bg-warning',
  ARCHIVED: 'bg-muted-foreground',
};

function StatusDot({ status, label }: { status: string; label: string }) {
  const dot = STATUS_DOT[status] ?? 'bg-muted-foreground';
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

export function OrganizationsTable({ items, isLoading }: Props) {
  const locale = useLocale();
  const t = useTranslations('organizations.table');
  const statusT = useTranslations('organizations.status');
  const dateLocale = locale === 'ar' ? 'ar-SA' : 'en-GB';

  return (
    <Table>
      <TableHeader>
        <TableRow className="h-10">
          <TableHead className="text-[11px] uppercase tracking-[0.06em]">{t('slug')}</TableHead>
          <TableHead className="text-[11px] uppercase tracking-[0.06em]">{t('name')}</TableHead>
          <TableHead className="text-[11px] uppercase tracking-[0.06em]">{t('owner')}</TableHead>
          <TableHead className="text-[11px] uppercase tracking-[0.06em]">{t('plan')}</TableHead>
          <TableHead className="text-[11px] uppercase tracking-[0.06em]">{t('status')}</TableHead>
          <TableHead className="text-[11px] uppercase tracking-[0.06em]">{t('created')}</TableHead>
          <TableHead className="text-end text-[11px] uppercase tracking-[0.06em]">
            {t('actions')}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="divide-y divide-border">
        {isLoading && !items
          ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={`skeleton-row-${i}`} className="h-10">
                <TableCell colSpan={7}>
                  <Skeleton className="h-5" />
                </TableCell>
              </TableRow>
            ))
          : items?.map((org) => (
              <TableRow
                key={org.id}
                className="h-10 hover:bg-surface-muted/60 transition-colors"
              >
                <TableCell className="mono text-xs text-muted-foreground">{org.slug}</TableCell>
                <TableCell>
                  <div className="text-sm font-medium">{org.nameAr}</div>
                  {org.nameEn ? (
                    <div className="text-xs text-muted-foreground">{org.nameEn}</div>
                  ) : null}
                </TableCell>
                <TableCell>
                  {org.owner ? (
                    <div>
                      {org.owner.name ? (
                        <div className="text-sm">{org.owner.name}</div>
                      ) : null}
                      <div className="text-xs text-muted-foreground">{org.owner.email}</div>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {org.subscription ? (
                    <span className="mono text-xs text-muted-foreground">
                      {org.subscription.plan.slug}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t('noPlan')}</span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusDot status={org.status} label={statusT(org.status)} />
                </TableCell>
                <TableCell className="tabular text-xs text-muted-foreground">
                  {new Date(org.createdAt).toLocaleDateString(dateLocale, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </TableCell>
                <TableCell className="text-end">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-sm"
                          aria-label={t('open')}
                        >
                          <Link href={`/organizations/${org.id}`}>
                            <ExternalLink className="size-3.5" strokeWidth={1.75} />
                          </Link>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('open')}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
              </TableRow>
            ))}
        {!isLoading && items?.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
              {t('empty')}
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}
