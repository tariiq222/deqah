'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@deqah/ui/primitives/button';
import { useListPlans } from '@/features/plans/list-plans/use-list-plans';
import { useListVerticals } from '@/features/verticals/list-verticals/use-list-verticals';
import type { WizardForm } from '../create-tenant-dialog';

export function isReviewStepValid(_form: WizardForm): boolean {
  return true;
}

interface Props {
  form: WizardForm;
  onEditStep: (step: 1 | 2 | 3) => void;
  errorMessage: string | null;
}

export function ReviewStep({ form, onEditStep, errorMessage }: Props) {
  const t = useTranslations('organizations.create');
  const { data: plans } = useListPlans();
  const { data: verticalsData } = useListVerticals();
  const verticals = verticalsData?.items;

  const planName = plans?.find((p) => p.id === form.planId)?.nameAr ?? t('noPlan');
  const verticalName = verticals?.find((v) => v.slug === form.verticalSlug)?.nameAr ?? t('noVertical');

  const ownerSummary =
    form.ownerMode === 'existing'
      ? (form.ownerLabel || form.ownerUserId)
      : `${form.ownerName} — ${form.ownerEmail}`;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {/* Owner card */}
        <div className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t('reviewOwner')}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => onEditStep(1)}>
              {t('editStep')}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground break-all">{ownerSummary}</p>
        </div>

        {/* Org card */}
        <div className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t('reviewOrg')}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => onEditStep(2)}>
              {t('editStep')}
            </Button>
          </div>
          <p className="text-sm font-semibold">{form.nameAr}</p>
          <p className="text-xs text-muted-foreground">{form.slug}</p>
          <p className="text-xs text-muted-foreground">{verticalName}</p>
        </div>

        {/* Plan card */}
        <div className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t('reviewPlan')}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => onEditStep(3)}>
              {t('editStep')}
            </Button>
          </div>
          <p className="text-sm font-semibold">{planName}</p>
          <p className="text-xs text-muted-foreground">
            {form.billingCycle === 'MONTHLY' ? t('monthly') : t('annual')}
          </p>
          <p className="text-xs text-muted-foreground">{form.trialDays} days trial</p>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}
