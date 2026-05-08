'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { ExternalLink } from 'lucide-react';
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
import type { OrganizationRow } from '../types';

interface Props {
  items: OrganizationRow[] | undefined;
  isLoading: boolean;
}

export function OrganizationsTable({ items, isLoading }: Props) {
  const locale = useLocale();
  const t = useTranslations('organizations.table');
  const statusT = useTranslations('organizations.status');
  const dateLocale = locale === 'ar' ? 'ar-SA' : 'en-GB';

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('slug')}</TableHead>
          <TableHead>{t('name')}</TableHead>
          <TableHead>{t('plan')}</TableHead>
          <TableHead>{t('status')}</TableHead>
          <TableHead>{t('created')}</TableHead>
          <TableHead className="text-end">{t('actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading && !items
          ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={6}>
                  <Skeleton className="h-6" />
                </TableCell>
              </TableRow>
            ))
          : items?.map((org) => (
              <TableRow key={org.id}>
                <TableCell className="font-mono text-xs">{org.slug}</TableCell>
                <TableCell>
                  <div className="font-medium">{org.nameAr}</div>
                  {org.nameEn ? (
                    <div className="text-xs text-muted-foreground">{org.nameEn}</div>
                  ) : null}
                </TableCell>
                <TableCell>
                  {org.subscription ? (
                    <span className="font-mono text-xs">{org.subscription.plan.slug}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t('noPlan')}</span>
                  )}
                </TableCell>
                <TableCell>
                  <OrgStatusBadge status={org.status} label={statusT(org.status)} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
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
                          className="size-9 rounded-sm"
                          aria-label={t('open')}
                        >
                          <Link href={`/organizations/${org.id}`}>
                            <ExternalLink className="size-4" />
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
            <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
              {t('empty')}
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}

function OrgStatusBadge({ status, label }: { status: string; label: string }) {
  const map: Record<string, string> = {
    TRIALING: 'border-primary/40 bg-primary/10 text-primary',
    ACTIVE: 'border-success/40 bg-success/10 text-success',
    PAST_DUE: 'border-warning/40 bg-warning/10 text-warning',
    SUSPENDED: 'border-warning/40 bg-warning/10 text-warning',
    ARCHIVED: 'border-muted/40 bg-muted/10 text-muted-foreground',
  };
  return (
    <Badge variant="outline" className={map[status] ?? 'border-border bg-muted/10'}>
      {label}
    </Badge>
  );
}
