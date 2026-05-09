'use client';

import { useState } from 'react';
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
        <Button variant="secondary">Impersonate user</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Impersonate a user in {organizationName}</DialogTitle>
          <DialogDescription>
            Issues a 15-minute shadow session. Every request you make under it is logged
            with your super-admin id. End the session manually from the sessions page or it
            auto-expires.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="target-user">Target user ID (UUID)</Label>
            <Input
              id="target-user"
              className="font-mono text-xs"
              placeholder="00000000-0000-0000-0000-000000000000"
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Paste the user&apos;s UUID from the Users page. Impersonating another super-admin is rejected.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || mutation.isPending}>
            {mutation.isPending ? 'Starting…' : 'Start session + redirect'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
