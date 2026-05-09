'use client';

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
          <DialogTitle>Delete plan</DialogTitle>
          <DialogDescription>
            You are about to delete{' '}
            <span className="font-semibold">
              {plan.nameEn} ({plan.slug})
            </span>
            . This action cannot be undone and is written to the audit log.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Deleting…' : 'Delete plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
