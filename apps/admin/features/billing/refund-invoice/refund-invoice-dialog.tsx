'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@deqah/ui/primitives/button';
import { Input } from '@deqah/ui/primitives/input';
import { Label } from '@deqah/ui/primitives/label';
import { Textarea } from '@deqah/ui/primitives/textarea';
import { RadioGroup, RadioGroupItem } from '@deqah/ui/primitives/radio-group';
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
import { useRefundInvoice } from './use-refund-invoice';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: SubscriptionInvoiceRow;
  orgId: string;
}

type Mode = 'full' | 'partial';

export function RefundInvoiceDialog({ open, onOpenChange, invoice, orgId }: Props) {
  const t = useTranslations('billing');
  const [mode, setMode] = useState<Mode>('full');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const mutation = useRefundInvoice(orgId);

  const totalAmount = Number(invoice.amount);
  const alreadyRefunded = invoice.refundedAmount ? Number(invoice.refundedAmount) : 0;
  const remaining = totalAmount - alreadyRefunded;

  const numericPartial = Number(amount);
  const validPartial =
    Number.isFinite(numericPartial) && numericPartial >= 0.01 && numericPartial <= remaining;
  const validReason = reason.trim().length >= 10;
  const canSubmit = (mode === 'full' ? remaining > 0 : validPartial) && validReason;

  const reset = () => {
    setMode('full');
    setAmount('');
    setReason('');
  };

  const submit = () => {
    if (!canSubmit) return;
    mutation.mutate(
      { invoiceId: invoice.id, amount: mode === 'full' ? undefined : numericPartial },
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
          <SheetTitle>{t('refund.title')}</SheetTitle>
          <SheetDescription>
            {t('refund.description', {
              invoiceId: invoice.id.slice(0, 8) + '…',
            })}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-5">
          {/* Invoice summary */}
          <div className="rounded-sm border border-border bg-muted/20 px-3 py-3 text-sm">
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">{t('refund.invoiceTotal')}</span>
              <span className="tabular-nums font-mono">
                {totalAmount.toFixed(2)}{' '}
                <span className="text-xs text-muted-foreground">{invoice.currency}</span>
              </span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">{t('refund.alreadyRefunded')}</span>
              <span className="tabular-nums font-mono">
                {alreadyRefunded.toFixed(2)}{' '}
                <span className="text-xs text-muted-foreground">{invoice.currency}</span>
              </span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 mt-1.5">
              <span className="text-muted-foreground">{t('refund.refundable')}</span>
              <span className="font-semibold tabular-nums font-mono">
                {remaining.toFixed(2)}{' '}
                <span className="text-xs font-normal text-muted-foreground">{invoice.currency}</span>
              </span>
            </div>
          </div>

          {/* Refund mode */}
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-widest text-muted-foreground">
              {t('refund.refundAmountLabel')} <span className="text-destructive">*</span>
            </Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} className="gap-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="full" id="rf-full" />
                <Label htmlFor="rf-full" className="font-normal cursor-pointer">
                  {t('refund.full')}{' '}
                  <span className="tabular-nums font-mono text-xs text-muted-foreground">
                    ({remaining.toFixed(2)} {invoice.currency})
                  </span>
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="partial" id="rf-partial" />
                <Label htmlFor="rf-partial" className="font-normal cursor-pointer">
                  {t('refund.partial')}
                </Label>
              </div>
            </RadioGroup>
          </div>

          {mode === 'partial' ? (
            <div className="space-y-1.5">
              <Label htmlFor="rf-amount" className="text-[11px] uppercase tracking-widest text-muted-foreground">
                {t('refund.partialAmountLabel')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="rf-amount"
                type="number"
                min={0.01}
                max={remaining}
                step={0.01}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t('refund.partialAmountPlaceholder', { max: remaining.toFixed(2) })}
                className="tabular-nums font-mono"
              />
              {amount && !validPartial ? (
                <p className="text-xs text-destructive">
                  {t('refund.partialAmountError', { max: remaining.toFixed(2), currency: invoice.currency })}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="rf-reason" className="text-[11px] uppercase tracking-widest text-muted-foreground">
              {t('refund.reasonLabel')} <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="rf-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('refund.reasonPlaceholder')}
              rows={4}
            />
            {reason.length > 0 && !validReason ? (
              <p className="text-xs text-destructive">
                {t('refund.reasonError', { count: reason.length })}
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
            {t('refund.cancel')}
          </Button>
          <Button
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
            onClick={submit}
            disabled={mutation.isPending || !canSubmit}
          >
            {mutation.isPending ? t('refund.submitting') : t('refund.submit')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
