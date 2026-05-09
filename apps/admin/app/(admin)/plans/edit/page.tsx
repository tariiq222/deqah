'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@deqah/ui/primitives/skeleton';
import { useListPlans } from '@/features/plans/list-plans/use-list-plans';
import { ComparePlansMatrix } from '@/features/plans/compare-plans/compare-plans-matrix';

export default function PlansEditPage() {
  const t = useTranslations('plans');
  const { data, isLoading, error } = useListPlans();

  return (
    <div className="flex flex-col gap-8 h-full">
      <div className="space-y-1">
        <Link
          href="/plans"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('backToPlansShort')}
        </Link>
        {/* TODO i18n: "Edit plans" — no key in plans.* namespace */}
        <h2 className="mt-2 text-xl font-semibold">Edit plans</h2>
        {/* TODO i18n: "Configure features and limits across every plan in one view." — no key in plans.* namespace */}
        <p className="text-sm text-muted-foreground">
          Configure features and limits across every plan in one view.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-destructive">
          {/* TODO i18n: "Failed to load: {message}" */}
          Failed to load: {(error as Error).message}
        </p>
      ) : null}

      {isLoading && !data ? (
        <Skeleton className="h-96" />
      ) : data ? (
        <ComparePlansMatrix plans={data} />
      ) : null}
    </div>
  );
}
