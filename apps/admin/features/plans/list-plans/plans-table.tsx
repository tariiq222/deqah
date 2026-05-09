'use client';

import Link from 'next/link';
import { Pencil, Trash2 } from 'lucide-react';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@deqah/ui/primitives/tooltip';
import type { PlanRow } from '../types';
import { formatCurrency } from '@/lib/currency';

interface Props {
  items: PlanRow[] | undefined;
  isLoading: boolean;
  onDelete: (plan: PlanRow) => void;
}

export function PlansTable({ items, isLoading, onDelete }: Props) {
  const t = useTranslations('plans');
  const tc = useTranslations('common');
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('table.slug')}</TableHead>
          <TableHead>{t('table.name')}</TableHead>
          <TableHead className="text-right">{t('table.subscribers')}</TableHead>
          <TableHead className="text-right">{t('table.monthly')}</TableHead>
          <TableHead className="text-right">{t('table.annual')}</TableHead>
          <TableHead>{t('table.status')}</TableHead>
          <TableHead className="w-24">{t('table.actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading && !items
          ? Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={`skeleton-row-${i}`}>
                <TableCell colSpan={7}>
                  <Skeleton className="h-6" />
                </TableCell>
              </TableRow>
            ))
          : items?.map((plan) => {
              const subs = plan._count.subscriptions;
              return (
                <TableRow key={plan.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{plan.slug}</span>
                      {subs > 0 ? (
                        <Badge
                          variant="outline"
                          className="border-primary/30 bg-primary/10 px-1.5 py-0 font-mono text-[10px] tabular-nums text-primary"
                          title={subs === 1 ? t('table.subscriberTitle', { count: subs }) : t('table.subscribersTitlePlural', { count: subs })}
                        >
                          {subs}
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{plan.nameAr}</div>
                    <div className="text-xs text-muted-foreground">{plan.nameEn}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {subs === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      subs.toLocaleString()
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(plan.priceMonthly, plan.currency)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(plan.priceAnnual, plan.currency)}
                  </TableCell>
                  <TableCell>
                    {plan.isActive ? (
                      <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
                        {tc('active')}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        {tc('inactive')}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-9 rounded-sm"
                              asChild
                              aria-label={tc('edit')}
                            >
                              <Link href={`/plans/${plan.id}/edit`}>
                                <Pencil className="size-4" />
                              </Link>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{tc('edit')}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-9 rounded-sm text-destructive hover:text-destructive"
                              onClick={() => onDelete(plan)}
                              aria-label={tc('delete')}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{tc('delete')}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
        {!isLoading && items?.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
              {t('table.empty')}
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}
