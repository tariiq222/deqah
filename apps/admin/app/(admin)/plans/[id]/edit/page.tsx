'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@deqah/ui/primitives/skeleton';
import { useListPlans } from '@/features/plans/list-plans/use-list-plans';
import { DEFAULT_PLAN_LIMITS, type PlanLimits } from '@/features/plans/plan-limits';
import { useUpdatePlan } from '@/features/plans/update-plan/use-update-plan';
import { PlanWizard } from '@/features/plans/plan-wizard/plan-wizard';
import type { BasicsForm } from '@/features/plans/plan-wizard/step-basics';

export default function EditPlanPage() {
  const t = useTranslations('plans');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: plans, isLoading } = useListPlans();
  const mutation = useUpdatePlan();

  const plan = plans?.find((p) => p.id === id);

  const [basics, setBasics] = useState<BasicsForm>({
    slug: '',
    nameAr: '',
    nameEn: '',
    priceMonthly: '',
    priceAnnual: '',
    currency: 'SAR',
  });
  const [limits, setLimits] = useState<PlanLimits>(DEFAULT_PLAN_LIMITS);
  const [isActive, setIsActive] = useState(true);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (plan && !initialized) {
      setBasics({
        slug: plan.slug,
        nameAr: plan.nameAr,
        nameEn: plan.nameEn,
        priceMonthly: String(plan.priceMonthly),
        priceAnnual: String(plan.priceAnnual),
        currency: plan.currency,
      });
      setIsActive(plan.isActive);
      setLimits({ ...DEFAULT_PLAN_LIMITS, ...(plan.limits as Partial<PlanLimits>) });
      setInitialized(true);
    }
  }, [plan, initialized]);

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-64 w-full rounded-sm" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="space-y-4">
        <Link
          href="/plans"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('backToPlans')}
        </Link>
        <p className="text-sm text-muted-foreground">{t('edit.notFound')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Link
          href="/plans"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('backToPlans')}
        </Link>
        <h2 className="mt-2 text-xl font-semibold">{t('edit.title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('edit.description')}
        </p>
      </div>

      {initialized && (
        <PlanWizard
          mode="edit"
          initialSlug={plan.slug}
          initialBasics={basics}
          initialLimits={limits}
          isActive={isActive}
          onIsActiveChange={setIsActive}
          isSubmitting={mutation.isPending}
          onCancel={() => router.push('/plans')}
          onSubmit={({ basics: b, limits: l }) => {
            mutation.mutate(
              {
                planId: id,
                nameAr: b.nameAr.trim(),
                nameEn: b.nameEn.trim(),
                priceMonthly: Number(b.priceMonthly),
                priceAnnual: Number(b.priceAnnual),
                currency: b.currency.trim() || 'SAR',
                isActive,
                limits: { ...l },
              },
              { onSuccess: () => router.push('/plans') },
            );
          }}
        />
      )}
    </div>
  );
}
