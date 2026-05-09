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
import { Input } from '@deqah/ui/primitives/input';
import { Label } from '@deqah/ui/primitives/label';
import { useStartImpersonation } from './use-start-impersonation';

interface Props {
  organizationId: string;
  organizationName: string;
}

export function ImpersonateDialog({ organizationId, organizationName }: Props) {
  const t = useTranslations('organizations.impersonate');
  const tc = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [targetUserId, setTargetUserId] = useState('');
  const mutation = useStartImpersonation();

  function submit() {
    mutation.mutate(
      { organizationId, targetUserId: targetUserId.trim() },
      {
        onSuccess: (result) => {
          // Navigate the current tab to the tenant dashboard carrying the
          // shadow JWT — the dashboard picks it up and drops the red
          // impersonation banner.
          window.location.href = result.redirectUrl;
        },
      },
    );
  }

  const valid =
    targetUserId.trim().length > 0 && /^[0-9a-f-]{36}$/i.test(targetUserId.trim());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">{t('button')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title', { orgName: organizationName })}</DialogTitle>
          <DialogDescription>
            {t('description')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="target-user">{t('targetUserId')}</Label>
            <Input
              id="target-user"
              className="font-mono text-xs"
              placeholder={t('targetUserIdPlaceholder')}
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t('targetUserIdHint')}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>
            {t('cancel')}
          </Button>
          <Button onClick={submit} disabled={!valid || mutation.isPending}>
            {mutation.isPending ? t('submitting') : t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
