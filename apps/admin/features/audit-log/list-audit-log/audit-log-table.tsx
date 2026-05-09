'use client';

import { useTranslations } from 'next-intl';
import { Receipt, UserMinus, Eye, Layers, KeyRound, CreditCard, Trash2, RefreshCcw } from 'lucide-react';
import { Skeleton } from '@deqah/ui/primitives/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@deqah/ui/primitives/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@deqah/ui/primitives/tooltip';
import type { AuditLogEntry } from './list-audit-log.api';

interface Props {
  items: AuditLogEntry[] | undefined;
  isLoading: boolean;
}

const ACTION_ICONS: Record<string, React.ElementType> = {
  INVOICE_WAIVED: Receipt,
  INVOICE_REFUNDED: Receipt,
  BILLING_CREDIT_GRANTED: CreditCard,
  PLAN_CHANGED: Layers,
  PLAN_CREATE: Layers,
  PLAN_UPDATE: Layers,
  PLAN_DELETE: Trash2,
  VERTICAL_CREATE: Layers,
  VERTICAL_UPDATE: Layers,
  VERTICAL_DELETE: Trash2,
  SUSPEND_ORG: UserMinus,
  REINSTATE_ORG: RefreshCcw,
  IMPERSONATE_START: Eye,
  IMPERSONATE_END: Eye,
  RESET_PASSWORD: KeyRound,
};

function actionIcon(actionType: string) {
  const Icon = ACTION_ICONS[actionType] ?? Layers;
  return <Icon size={14} strokeWidth={1.75} className="text-muted-foreground shrink-0" />;
}

function verbSentence(entry: AuditLogEntry): string {
  const { actionType, organizationId, metadata } = entry;
  const orgSuffix = organizationId ? ` for ${organizationId}` : '';
  const meta = metadata as Record<string, unknown>;
  switch (actionType) {
    case 'INVOICE_WAIVED':
      return `waived invoice ${String(meta.invoiceId ?? '')}${orgSuffix}`;
    case 'INVOICE_REFUNDED':
      return `refunded invoice ${String(meta.invoiceId ?? '')}${orgSuffix}`;
    case 'BILLING_CREDIT_GRANTED':
      return `granted credit${orgSuffix}`;
    case 'PLAN_CHANGED':
      return `changed plan${orgSuffix}`;
    case 'PLAN_CREATE':
      return `created plan ${String(meta.planId ?? '')}`;
    case 'PLAN_UPDATE':
      return `updated plan ${String(meta.planId ?? '')}`;
    case 'PLAN_DELETE':
      return `deleted plan ${String(meta.planId ?? '')}`;
    case 'VERTICAL_CREATE':
      return `created vertical ${String(meta.slug ?? '')}`;
    case 'VERTICAL_UPDATE':
      return `updated vertical ${String(meta.slug ?? '')}`;
    case 'VERTICAL_DELETE':
      return `deleted vertical ${String(meta.slug ?? '')}`;
    case 'SUSPEND_ORG':
      return `suspended org${orgSuffix}`;
    case 'REINSTATE_ORG':
      return `reinstated org${orgSuffix}`;
    case 'IMPERSONATE_START':
      return `started impersonation${orgSuffix}`;
    case 'IMPERSONATE_END':
      return `ended impersonation${orgSuffix}`;
    case 'RESET_PASSWORD':
      return `reset password${orgSuffix}`;
    default:
      return actionType.toLowerCase().replace(/_/g, ' ') + orgSuffix;
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function monoTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-GB');
}

export function AuditLogTable({ items, isLoading }: Props) {
  const t = useTranslations('auditLog');

  return (
    <TooltipProvider delayDuration={200}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>{t('table.actor')}</TableHead>
            <TableHead>{t('table.action')}</TableHead>
            <TableHead className="text-right tabular-nums">{t('table.when')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && !items
            ? Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={`skeleton-row-${i}`}>
                  <TableCell colSpan={4}>
                    <Skeleton className="h-5" />
                  </TableCell>
                </TableRow>
              ))
            : items?.map((entry) => (
                <TableRow key={entry.id} className="group">
                  {/* Leading icon */}
                  <TableCell className="w-8 pr-0">
                    <span className="flex h-6 w-6 items-center justify-center">
                      {actionIcon(entry.actionType)}
                    </span>
                  </TableCell>

                  {/* Actor */}
                  <TableCell>
                    <span className="font-mono text-[12px] text-foreground">
                      {entry.superAdminUserId}
                    </span>
                  </TableCell>

                  {/* Verb sentence */}
                  <TableCell className="text-[13px] text-foreground">
                    {verbSentence(entry)}
                  </TableCell>

                  {/* Relative timestamp with full tooltip */}
                  <TableCell className="text-right">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="tabular-nums text-[12px] text-muted-foreground cursor-default">
                          {relativeTime(entry.createdAt)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        <span className="font-mono text-[11px]">{monoTimestamp(entry.createdAt)}</span>
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
          {!isLoading && items?.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                {t('table.empty')}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </TooltipProvider>
  );
}
