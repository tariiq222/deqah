'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@deqah/ui/primitives/button';
import { Input } from '@deqah/ui/primitives/input';
import { Label } from '@deqah/ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@deqah/ui/primitives/select';
import type { SubscriptionInvoiceStatus } from '../types';

export type InvoiceStatusFilter = 'all' | SubscriptionInvoiceStatus;

interface Props {
  status: InvoiceStatusFilter;
  onStatusChange: (next: InvoiceStatusFilter) => void;
  organizationId: string;
  onOrganizationIdChange: (next: string) => void;
  fromDate: string;
  onFromDateChange: (next: string) => void;
  toDate: string;
  onToDateChange: (next: string) => void;
  onReset: () => void;
}

const STATUSES: SubscriptionInvoiceStatus[] = ['DUE', 'PAID', 'FAILED', 'VOID', 'DRAFT'];

export function InvoicesFilterBar({
  status,
  onStatusChange,
  organizationId,
  onOrganizationIdChange,
  fromDate,
  onFromDateChange,
  toDate,
  onToDateChange,
  onReset,
}: Props) {
  const t = useTranslations('billing');
  const tc = useTranslations('common');
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card/50 px-4 py-3">
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">{tc('status')}</Label>
        <Select value={status} onValueChange={(v) => onStatusChange(v as InvoiceStatusFilter)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={tc('status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{/* TODO i18n: All (no drafts) */}All (no drafts)</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`invoiceStatus.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">{t('filters.organizationId')}</Label>
        <Input
          placeholder="Filter by orgId"
          value={organizationId}
          onChange={(e) => onOrganizationIdChange(e.target.value)}
          className="w-[260px] font-mono text-xs"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">{t('filters.fromDate')}</Label>
        <Input
          type="date"
          value={fromDate}
          onChange={(e) => onFromDateChange(e.target.value)}
          className="w-[160px]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">{t('filters.toDate')}</Label>
        <Input
          type="date"
          value={toDate}
          onChange={(e) => onToDateChange(e.target.value)}
          className="w-[160px]"
        />
      </div>
      <Button variant="ghost" size="sm" onClick={onReset}>
        {tc('reset')}
      </Button>
    </div>
  );
}
