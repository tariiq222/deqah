'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@deqah/ui/primitives/button';
import { Input } from '@deqah/ui/primitives/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@deqah/ui/primitives/select';

const ACTION_TYPES = [
  'SUSPEND_ORG',
  'REINSTATE_ORG',
  'IMPERSONATE_START',
  'IMPERSONATE_END',
  'RESET_PASSWORD',
  'PLAN_CREATE',
  'PLAN_UPDATE',
  'PLAN_DELETE',
  'VERTICAL_CREATE',
  'VERTICAL_UPDATE',
  'VERTICAL_DELETE',
] as const;

interface Props {
  actionType: string;
  onActionTypeChange: (value: string) => void;
  organizationId: string;
  onOrganizationIdChange: (value: string) => void;
  onReset: () => void;
}

export function AuditLogFilterBar({
  actionType,
  onActionTypeChange,
  organizationId,
  onOrganizationIdChange,
  onReset,
}: Props) {
  const t = useTranslations('auditLog');
  const tc = useTranslations('common');
  const isFiltered = actionType !== 'all' || organizationId !== '';

  return (
    <div className="flex flex-wrap items-center gap-2 border-y border-border py-2">
      <Select value={actionType} onValueChange={onActionTypeChange}>
        <SelectTrigger className="h-8 w-[200px] text-[13px]">
          <SelectValue placeholder={t('filters.actionType')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.allActionTypes')}</SelectItem>
          {ACTION_TYPES.map((type) => (
            <SelectItem key={type} value={type} className="font-mono text-xs">
              {type}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        placeholder={t('filters.organizationId')}
        value={organizationId}
        onChange={(e) => onOrganizationIdChange(e.target.value)}
        className="h-8 w-56 font-mono text-[13px]"
      />

      {isFiltered && (
        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={onReset}>
          {t('filters.reset')}
        </Button>
      )}
    </div>
  );
}
