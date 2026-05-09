'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@deqah/ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@deqah/ui/primitives/select';
import type { SubscriptionStatus } from '../types';

export type StatusFilter = 'all' | SubscriptionStatus;

interface Props {
  status: StatusFilter;
  onStatusChange: (next: StatusFilter) => void;
  onReset: () => void;
}

const STATUSES: SubscriptionStatus[] = [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'SUSPENDED',
  'CANCELED',
];

export function SubscriptionsFilterBar({ status, onStatusChange, onReset }: Props) {
  const t = useTranslations('billing');
  const tc = useTranslations('common');
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/50 px-4 py-3">
      <Select value={status} onValueChange={(v) => onStatusChange(v as StatusFilter)}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder={tc('status')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.allStatuses')}</SelectItem>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {t(`subscriptionStatus.${s}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="ghost" size="sm" onClick={onReset}>
        {tc('reset')}
      </Button>
    </div>
  );
}
