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
import type { VerticalRow } from '../types';
import { useDeleteVertical } from './use-delete-vertical';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vertical: VerticalRow;
}

export function DeleteVerticalDialog({ open, onOpenChange, vertical }: Props) {
  const mutation = useDeleteVertical();

  const submit = () => {
    mutation.mutate(
      { verticalId: vertical.id },
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
          <DialogTitle>Delete vertical</DialogTitle>
          <DialogDescription>
            You are about to delete{' '}
            <span className="font-semibold">
              {vertical.nameEn} ({vertical.slug})
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
            {mutation.isPending ? 'Deleting…' : 'Delete vertical'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
