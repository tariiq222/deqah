'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Building2, CreditCard, FileText, Settings } from 'lucide-react';

const iconClass = 'text-muted-foreground shrink-0' as const;
const iconProps = { size: 16, strokeWidth: 1.75, className: iconClass } as const;

export function QuickActions() {
  const t = useTranslations('overview');

  return (
    <div>
      <p className="mb-3 text-[11px] uppercase tracking-widest text-muted-foreground">
        {t('quickActions.title')}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link
          href="/organizations"
          className="flex items-center gap-3 rounded-md border border-border px-4 py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          <Building2 {...iconProps} />
          {t('quickActions.organizations')}
        </Link>
        <Link
          href="/billing"
          className="flex items-center gap-3 rounded-md border border-border px-4 py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          <CreditCard {...iconProps} />
          {t('quickActions.billing')}
        </Link>
        <Link
          href="/audit-log"
          className="flex items-center gap-3 rounded-md border border-border px-4 py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          <FileText {...iconProps} />
          {t('quickActions.auditLog')}
        </Link>
        <Link
          href="/settings"
          className="flex items-center gap-3 rounded-md border border-border px-4 py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          <Settings {...iconProps} />
          {t('quickActions.settings')}
        </Link>
      </div>
    </div>
  );
}
