'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@deqah/ui/primitives/input';
import { Label } from '@deqah/ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@deqah/ui/primitives/select';
import { useListPlans } from '@/features/plans/list-plans/use-list-plans';
import type { WizardForm } from '../create-tenant-dialog';

export function isPlanStepValid(form: WizardForm): boolean {
  const days = form.trialDays.trim() === '' ? 0 : Number(form.trialDays);
  return Number.isInteger(days) && days >= 0 && days <= 90;
}

interface Props {
  form: WizardForm;
  set: (field: keyof WizardForm) => (value: string) => void;
}

export function PlanStep({ form, set }: Props) {
  const t = useTranslations('organizations.create');
  const { data: plans } = useListPlans();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="tenant-plan">{t('planId')}</Label>
        <Select
          value={form.planId || '__none__'}
          onValueChange={(v) => set('planId')(v === '__none__' ? '' : v)}
        >
          <SelectTrigger id="tenant-plan">
            <SelectValue placeholder={t('planId')} />
          </SelectTrigger>
          <SelectContent>
            {/* TODO i18n: — None — */}
            <SelectItem value="__none__">— None —</SelectItem>
            {plans?.filter((p) => p.isActive).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nameAr} — {p.slug}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tenant-billing-cycle">{t('billingCycle')}</Label>
        <Select value={form.billingCycle} onValueChange={(v) => set('billingCycle')(v)}>
          <SelectTrigger id="tenant-billing-cycle">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MONTHLY">{t('monthly')}</SelectItem>
            <SelectItem value="ANNUAL">{t('annual')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tenant-trial-days">{t('trialDays')}</Label>
        <Input
          id="tenant-trial-days"
          type="number"
          min={0}
          max={90}
          value={form.trialDays}
          onChange={(e) => set('trialDays')(e.target.value)}
        />
      </div>
    </div>
  );
}
