'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@deqah/ui/primitives/skeleton';
import { useListPlans } from '@/features/plans/list-plans/use-list-plans';
import { ComparePlansMatrix } from '@/features/plans/compare-plans/compare-plans-matrix';

export default function ComparePlansPage() {
  const t = useTranslations('plans');
  const { data, isLoading } = useListPlans();

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Link
          href="/plans"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('backToPlansShort')}
        </Link>
        <h2 className="mt-2 text-xl font-semibold">{t('compare.title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('compare.description')}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full rounded-sm" />
          <Skeleton className="h-64 w-full rounded-sm" />
        </div>
      ) : (
        <ComparePlansMatrix plans={data ?? []} />
      )}
    </div>
  );
}
