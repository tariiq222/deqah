import { Decimal } from '@prisma/client/runtime/client';

export interface ComputeRefundAccountingInput {
  invoiceTotal: Decimal | string | number;
  invoiceVatAmt: Decimal | string | number;
  alreadyRefundedAmount: Decimal | string | number;
  thisRefundAmount: number;
}

export interface ComputeRefundAccountingResult {
  refundedVatPortion: number;
  newRefundedAmount: number;
  newRefundedVatAmt: number;
  newInvoiceStatus: 'REFUNDED' | 'PARTIALLY_REFUNDED';
}

/**
 * Compute the VAT portion of a refund proportional to (refund / total),
 * the new cumulative refunded amount + VAT, and the new invoice status.
 *
 * VAT is allocated proportionally because refunds are against the gross
 * (VAT-inclusive) total — every riyal refunded carries (vatAmt/total) of VAT.
 *
 * Status flips to REFUNDED only when newRefundedAmount >= invoiceTotal
 * (within a 0.01 SAR tolerance to absorb decimal rounding).
 */
export function computeRefundAccounting(
  input: ComputeRefundAccountingInput,
): ComputeRefundAccountingResult {
  const total = new Decimal(input.invoiceTotal);
  const vatAmt = new Decimal(input.invoiceVatAmt);
  const alreadyRefunded = new Decimal(input.alreadyRefundedAmount);
  const thisRefund = new Decimal(input.thisRefundAmount);

  const vatRatio = total.isZero() ? new Decimal(0) : vatAmt.div(total);
  const refundedVatPortion = thisRefund.times(vatRatio).toDecimalPlaces(2);

  const newRefundedAmount = alreadyRefunded.plus(thisRefund).toDecimalPlaces(2);
  const newRefundedVatAmt = newRefundedAmount.times(vatRatio).toDecimalPlaces(2);

  const tolerance = new Decimal('0.01');
  const isFullyRefunded = newRefundedAmount.gte(total.minus(tolerance));

  return {
    refundedVatPortion: refundedVatPortion.toNumber(),
    newRefundedAmount: newRefundedAmount.toNumber(),
    newRefundedVatAmt: newRefundedVatAmt.toNumber(),
    newInvoiceStatus: isFullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
  };
}
