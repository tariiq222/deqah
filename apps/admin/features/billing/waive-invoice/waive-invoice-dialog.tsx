'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@deqah/ui/primitives/button';
import { Label } from '@deqah/ui/primitives/label';
import { Textarea } from '@deqah/ui/primitives/textarea';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@deqah/ui/primitives/sheet';
import type { SubscriptionInvoiceRow } from '../types';
import { useWaiveInvoice } from './use-waive-invoice';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: SubscriptionInvoiceRow;
  orgId: string;
}

export function WaiveInvoiceDialog({ open, onOpenChange, invoice, orgId }: Props) {
  const t = useTranslations('billing');
  const [reason, setReason] = useState('');
  const mutation = useWaiveInvoice(orgId);

  const canSubmit = reason.trim().length >= 10;

  const reset = () => setReason('');

  const submit = () => {
    if (!canSubmit) return;
    mutation.mutate(
      { invoiceId: invoice.id },
      {
        onSuccess: () => {
          onOpenChange(false);
          reset();
        },
      },
    );
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{t('waive.title')}</SheetTitle>
          <SheetDescription>
            {t('waive.description', {
              invoiceId: invoice.id.slice(0, 8) + '…',
              amount: Number(invoice.amount).toFixed(2),
              currency: invoice.currency,
            })}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="waive-reason" className="text-[11px] uppercase tracking-widest text-muted-foreground">
              {t('waive.reasonLabel')} <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="waive-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('waive.reasonPlaceholder')}
              rows={4}
            />
            {reason.length > 0 && !canSubmit ? (
              <p className="text-xs text-destructive">
                {t('waive.reasonError', { count: reason.length })}
              </p>
            ) : null}
          </div>
        </SheetBody>

        <SheetFooter>
          <Button
            variant="ghost"
            onClick={() => {
              onOpenChange(false);
              reset();
            }}
            disabled={mutation.isPending}
          >
            {t('waive.cancel')}
          </Button>
          <Button
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
            onClick={submit}
            disabled={mutation.isPending || !canSubmit}
          >
            {mutation.isPending ? t('waive.submitting') : t('waive.submit')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
