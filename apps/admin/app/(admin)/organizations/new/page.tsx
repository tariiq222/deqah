'use client';

import { FormEvent, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@deqah/ui/primitives/button';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { useCreateTenant } from '@/features/organizations/create-tenant/use-create-tenant';
import {
  OwnerStep,
  isOwnerStepValid,
} from '@/features/organizations/create-tenant/steps/owner-step';
import {
  OrgStep,
  isOrgStepValid,
} from '@/features/organizations/create-tenant/steps/org-step';
import {
  PlanStep,
  isPlanStepValid,
} from '@/features/organizations/create-tenant/steps/plan-step';
import type { WizardForm } from '@/features/organizations/create-tenant/create-tenant-dialog';

export type { WizardForm };

const DEFAULT_FORM: WizardForm = {
  ownerMode: 'existing',
  ownerUserId: '',
  ownerLabel: '',
  ownerName: '',
  ownerEmail: '',
  ownerPhone: '',
  ownerPassword: '',
  slug: '',
  nameAr: '',
  nameEn: '',
  verticalSlug: '',
  planId: '',
  billingCycle: 'MONTHLY',
  trialDays: '14',
};

export default function CreateOrganizationPage() {
  const t = useTranslations('organizations.create');
  const router = useRouter();
  const pathname = usePathname();
  const [form, setForm] = useState<WizardForm>(DEFAULT_FORM);
  const mutation = useCreateTenant();

  const set = (field: keyof WizardForm) => (value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const canSubmit =
    isOwnerStepValid(form) && isOrgStepValid(form) && isPlanStepValid(form);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || mutation.isPending) return;

    const trialDaysValue =
      form.trialDays.trim() === '' ? undefined : Number(form.trialDays);

    mutation.mutate(
      {
        slug: form.slug.trim(),
        nameAr: form.nameAr.trim(),
        nameEn: form.nameEn.trim() || undefined,
        ...(form.ownerMode === 'existing'
          ? { ownerUserId: form.ownerUserId.trim() }
          : {
              ownerName: form.ownerName.trim(),
              ownerEmail: form.ownerEmail.trim(),
              ownerPhone: form.ownerPhone.trim() || undefined,
              ownerPassword: form.ownerPassword,
            }),
        verticalSlug: form.verticalSlug.trim() || undefined,
        planId: form.planId.trim() || undefined,
        ...(form.planId.trim() ? { billingCycle: form.billingCycle } : {}),
        trialDays: trialDaysValue,
      },
      {
        onSuccess: (org) => {
          router.push(`/organizations/${org.id}`);
        },
      },
    );
  };

  const errorMessage =
    mutation.error instanceof Error ? mutation.error.message : null;

  return (
    <div className="space-y-6">
      <Breadcrumbs pathname={pathname} />

      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <form onSubmit={submit} className="space-y-0">
        {/* Section 1: Owner */}
        <section className="py-6">
          <div className="mb-4">
            <h2 className="text-base font-semibold">{t('step1')}</h2>
          </div>
          <OwnerStep form={form} set={set} />
        </section>

        <div className="border-t" />

        {/* Section 2: Organization */}
        <section className="py-6">
          <div className="mb-4">
            <h2 className="text-base font-semibold">{t('step2')}</h2>
          </div>
          <OrgStep form={form} set={set} />
        </section>

        <div className="border-t" />

        {/* Section 3: Plan & Billing */}
        <section className="py-6">
          <div className="mb-4">
            <h2 className="text-base font-semibold">{t('step3')}</h2>
          </div>
          <PlanStep form={form} set={set} />
        </section>

        <div className="border-t" />

        {/* Error + Actions */}
        <div className="pt-6 space-y-4">
          {errorMessage ? (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/organizations')}
              disabled={mutation.isPending}
            >
              {t('cancel')}
            </Button>

            <Button type="submit" disabled={mutation.isPending || !canSubmit}>
              {mutation.isPending ? t('submitting') : t('submit')}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
