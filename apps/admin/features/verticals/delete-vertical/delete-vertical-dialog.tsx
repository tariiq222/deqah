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
import type { VerticalRow } from '../types';
import { useDeleteVertical } from './use-delete-vertical';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vertical: VerticalRow;
}

export function DeleteVerticalDialog({ open, onOpenChange, vertical }: Props) {
  const t = useTranslations('verticals.delete');
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
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('description', { name: vertical.nameEn, slug: vertical.slug })}
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
