'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@deqah/ui/primitives/button';
import { useListPlans } from '@/features/plans/list-plans/use-list-plans';
import { PlansTable } from '@/features/plans/list-plans/plans-table';
import { DeletePlanDialog } from '@/features/plans/delete-plan/delete-plan-dialog';
import { ErrorBanner } from '@/components/error-banner';
import type { PlanRow } from '@/features/plans/types';

export default function PlansPage() {
  const t = useTranslations('plans');
  const { data, isLoading, error, refetch } = useListPlans();
  const [deletePlan, setDeletePlan] = useState<PlanRow | null>(null);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{t('title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('description')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild size="sm">
            <Link href="/plans/compare">{t('compareButton')}</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/plans/new">+ {t('createButton')}</Link>
          </Button>
        </div>
      </div>

      {error ? (
        <ErrorBanner error={error} onRetry={() => void refetch()} context="page:plans" />
      ) : null}

      <PlansTable
        items={data}
        isLoading={isLoading}
        onDelete={(plan) => setDeletePlan(plan)}
      />

      {deletePlan ? (
        <DeletePlanDialog
          open={deletePlan !== null}
          onOpenChange={(open) => {
            if (!open) setDeletePlan(null);
          }}
          plan={deletePlan}
        />
      ) : null}
    </div>
  );
}
