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
import { useResetUserPassword } from './use-reset-user-password';

export function ResetPasswordDialog({
  userId,
  userEmail,
}: {
  userId: string;
  userEmail: string;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations('users');
  const mutation = useResetUserPassword();

  const submit = () => {
    mutation.mutate(
      { userId },
      {
        onSuccess: () => {
          setOpen(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          {t('resetPassword.button')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('resetPassword.title', { email: userEmail })}</DialogTitle>
          <DialogDescription>
            {t('resetPassword.description')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>
            {t('resetPassword.cancel')}
          </Button>
          <Button
            onClick={submit}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? t('resetPassword.submitting') : t('resetPassword.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
