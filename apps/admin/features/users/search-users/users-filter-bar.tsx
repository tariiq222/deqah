'use client';

import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@deqah/ui/primitives/button';
import { Input } from '@deqah/ui/primitives/input';

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  organizationId: string;
  onOrganizationIdChange: (value: string) => void;
  onReset: () => void;
}

export function UsersFilterBar({
  search,
  onSearchChange,
  organizationId,
  onOrganizationIdChange,
  onReset,
}: Props) {
  const t = useTranslations('users');
  const isFiltered = search !== '' || organizationId !== '';

  return (
    <div className="flex flex-wrap items-center gap-2 border-y border-border py-2">
      {/* Search — cmd+k style, 32px tall, monospaced placeholder */}
      <div className="relative flex-1 min-w-[240px] max-w-sm">
        <Search
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          size={14}
          strokeWidth={1.75}
        />
        <Input
          placeholder={t('search.placeholder')}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 pl-8 font-mono text-[13px] placeholder:text-muted-foreground/60"
        />
      </div>

      {/* Org ID filter */}
      <Input
        placeholder={t('search.orgIdPlaceholder')}
        value={organizationId}
        onChange={(e) => onOrganizationIdChange(e.target.value)}
        className="h-8 w-52 font-mono text-[13px]"
      />

      {isFiltered && (
        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={onReset}>
          {t('search.reset')}
        </Button>
      )}
    </div>
  );
}
