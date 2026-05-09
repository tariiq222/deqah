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
import { useGrantCredit } from './use-grant-credit';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
}

export function GrantCreditDialog({ open, onOpenChange, organizationId }: Props) {
  const [amount, setAmount] = useState('');
  const mutation = useGrantCredit(organizationId);

  const numericAmount = Number(amount);
  const validAmount = Number.isFinite(numericAmount) && numericAmount >= 1 && numericAmount <= 100000;
  const canSubmit = validAmount;

  const reset = () => {
    setAmount('');
  };

  const submit = () => {
    if (!canSubmit) return;
    mutation.mutate(
      {
        organizationId,
        amount: numericAmount,
        currency: 'SAR',
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
          <DialogTitle>Grant credit</DialogTitle>
          <DialogDescription>
            Adds a billing credit applied against this organization's next invoice.
            Range: 1 – 100,000 ⃁. All actions are audited.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="gc-amount">Amount (⃁)</Label>
            <Input
              id="gc-amount"
              type="number"
              min={1}
              max={100000}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="50"
            />
            {amount && !validAmount ? (
              <p className="text-xs text-destructive">Amount must be between 1 and 100,000 ⃁.</p>
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
          <Button onClick={submit} disabled={mutation.isPending || !canSubmit}>
            {mutation.isPending ? 'Granting…' : 'Grant credit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
