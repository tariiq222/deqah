'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@deqah/ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@deqah/ui/primitives/dialog';
import { Label } from '@deqah/ui/primitives/label';
import { useListPlans } from '@/features/plans/list-plans/use-list-plans';
import { useChangePlan } from './use-change-plan';

interface Props {
  orgId: string;
  currentPlanId: string;
}

export function ChangePlanDialog({ orgId, currentPlanId }: Props) {
  const t = useTranslations('organizations.changePlan');
  const [open, setOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState('');

  const { data: plans = [] } = useListPlans();
  const mutation = useChangePlan(orgId);

  const activePlans = plans.filter((p) => p.isActive);
  const isValid = selectedPlanId !== '' && selectedPlanId !== currentPlanId;

  function handleOpen(val: boolean) {
    setOpen(val);
    if (!val) {
      setSelectedPlanId('');
    }
  }

  function submit() {
    if (!isValid) return;
    mutation.mutate(
      { newPlanId: selectedPlanId },
      {
        onSuccess: () => {
          setOpen(false);
          setSelectedPlanId('');
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t('submit')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="cp-plan">{t('newPlan')}</Label>
            <select
              id="cp-plan"
              value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">{t('newPlanPlaceholder')}</option>
              {activePlans.map((p) => (
                <option key={p.id} value={p.id} disabled={p.id === currentPlanId}>
                  {/* TODO i18n: (current) suffix */}
                  {p.slug} — {p.nameEn}{p.id === currentPlanId ? ' (current)' : ''}
                </option>
              ))}
            </select>
          </div>

          {mutation.error ? (
            <p className="text-xs text-destructive">
              {(mutation.error as Error).message}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>
            {t('cancel')}
          </Button>
          <Button onClick={submit} disabled={!isValid || mutation.isPending}>
            {mutation.isPending ? t('submitting') : t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
