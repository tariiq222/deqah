'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@deqah/ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@deqah/ui/primitives/dialog';
import type { PlanRow } from '../types';
import { useDeletePlan } from './use-delete-plan';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PlanRow;
}

export function DeletePlanDialog({ open, onOpenChange, plan }: Props) {
  const t = useTranslations('plans.delete');
  const mutation = useDeletePlan();

  const submit = () => {
    mutation.mutate(
      { planId: plan.id },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('description', { name: plan.nameEn, slug: plan.slug })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            {t('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? t('submitting') : t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
