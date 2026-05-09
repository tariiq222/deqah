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
} from '@deqah/ui/primitives/dialog';
import { Input } from '@deqah/ui/primitives/input';
import { Label } from '@deqah/ui/primitives/label';
import { RadioGroup, RadioGroupItem } from '@deqah/ui/primitives/radio-group';
import type { SubscriptionInvoiceRow } from '../types';
import { useRefundInvoice } from './use-refund-invoice';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: SubscriptionInvoiceRow;
  orgId: string;
}

type Mode = 'full' | 'partial';

export function RefundInvoiceDialog({ open, onOpenChange, invoice, orgId }: Props) {
  const [mode, setMode] = useState<Mode>('full');
  const [amount, setAmount] = useState('');
  const mutation = useRefundInvoice(orgId);

  const totalAmount = Number(invoice.amount);
  const alreadyRefunded = invoice.refundedAmount ? Number(invoice.refundedAmount) : 0;
  const remaining = totalAmount - alreadyRefunded;

  const numericPartial = Number(amount);
  const validPartial =
    Number.isFinite(numericPartial) && numericPartial >= 0.01 && numericPartial <= remaining;

  const canSubmit = mode === 'full' ? remaining > 0 : validPartial;

  const reset = () => {
    setMode('full');
    setAmount('');
  };

  const submit = () => {
    if (!canSubmit) return;
    mutation.mutate(
      {
        invoiceId: invoice.id,
        amount: mode === 'full' ? undefined : numericPartial,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          reset();
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Refund invoice</DialogTitle>
          <DialogDescription>
            Calls Moyasar to refund <span className="font-mono text-xs">{invoice.id.slice(0, 8)}…</span>.
            Funds return to the organization's card. This action is{' '}
            <span className="font-semibold">real money movement</span> and is audited.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total invoice</span>
              <span className="font-medium">
                {totalAmount.toFixed(2)} {invoice.currency}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Already refunded</span>
              <span>
                {alreadyRefunded.toFixed(2)} {invoice.currency}
              </span>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5 mt-1.5">
              <span className="text-muted-foreground">Refundable now</span>
              <span className="font-semibold">
                {remaining.toFixed(2)} {invoice.currency}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Refund amount</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="full" id="rf-full" />
                <Label htmlFor="rf-full" className="font-normal">
                  Full ({remaining.toFixed(2)} {invoice.currency})
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="partial" id="rf-partial" />
                <Label htmlFor="rf-partial" className="font-normal">
                  Partial
                </Label>
              </div>
            </RadioGroup>

            {mode === 'partial' ? (
              <div className="space-y-1.5">
                <Input
                  type="number"
                  min={0.01}
                  max={remaining}
                  step={0.01}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`Up to ${remaining.toFixed(2)}`}
                />
                {amount && !validPartial ? (
                  <p className="text-xs text-destructive">
                    Amount must be between 0.01 and {remaining.toFixed(2)} {invoice.currency}.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              reset();
            }}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={mutation.isPending || !canSubmit}
          >
            {mutation.isPending ? 'Processing…' : 'Refund via Moyasar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
