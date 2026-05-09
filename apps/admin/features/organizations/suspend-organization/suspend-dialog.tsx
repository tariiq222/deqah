'use client';

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

export function SuspendDialog({ organizationId }: { organizationId: string }) {
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
        <Button variant="destructive">Suspend</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suspend organization</DialogTitle>
          <DialogDescription>
            Members will be signed out within 30 seconds. This action is written to the audit log.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Suspending…' : 'Confirm suspend'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
