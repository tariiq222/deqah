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
import type { SubscriptionInvoiceRow } from '../types';
import { useWaiveInvoice } from './use-waive-invoice';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: SubscriptionInvoiceRow;
  orgId: string;
}

export function WaiveInvoiceDialog({ open, onOpenChange, invoice, orgId }: Props) {
  const mutation = useWaiveInvoice(orgId);

  const submit = () => {
    mutation.mutate(
      { invoiceId: invoice.id },
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
          <DialogTitle>Waive invoice</DialogTitle>
          <DialogDescription>
            Voids invoice{' '}
            <span className="font-mono text-xs">{invoice.id.slice(0, 8)}…</span> for{' '}
            <span className="font-semibold">
              {Number(invoice.amount).toFixed(2)} {invoice.currency}
            </span>
            . Only DUE/FAILED invoices can be waived. No money moves; PAID invoices require a refund instead.
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
            {mutation.isPending ? 'Waiving…' : 'Waive invoice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
