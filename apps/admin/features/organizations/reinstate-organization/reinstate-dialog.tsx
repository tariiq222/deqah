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
import { useReinstateOrganization } from './use-reinstate-organization';

export function ReinstateDialog({ organizationId }: { organizationId: string }) {
  const [open, setOpen] = useState(false);
  const mutation = useReinstateOrganization(organizationId);

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
        <Button variant="outline">Reinstate</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reinstate organization</DialogTitle>
          <DialogDescription>
            Confirm reinstatement. This action is written to the audit log.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Reinstating…' : 'Confirm reinstate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
