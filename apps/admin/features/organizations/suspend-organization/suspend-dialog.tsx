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
  DialogTrigger,
} from '@deqah/ui/primitives/dialog';
import { useState } from 'react';
import { useSuspendOrganization } from './use-suspend-organization';

export function SuspendDialog({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName?: string;
}) {
  const t = useTranslations('organizations.suspend');
  const [open, setOpen] = useState(false);
  const mutation = useSuspendOrganization(organizationId);

  const submit = () => {
    mutation.mutate(undefined, {
      onSuccess: () => {
        setOpen(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">{t('submit')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('description', { name: organizationName ?? '' })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>
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
