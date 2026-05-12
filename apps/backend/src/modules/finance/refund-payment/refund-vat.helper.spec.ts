import { computeRefundAccounting } from './refund-vat.helper';

describe('computeRefundAccounting', () => {
  it('full refund of a 115 SAR invoice (100 + 15 VAT) returns REFUNDED + full VAT', () => {
    const r = computeRefundAccounting({
      invoiceTotal: 115,
      invoiceVatAmt: 15,
      alreadyRefundedAmount: 0,
      thisRefundAmount: 115,
    });
    expect(r.refundedVatPortion).toBe(15);
    expect(r.newRefundedAmount).toBe(115);
    expect(r.newRefundedVatAmt).toBe(15);
    expect(r.newInvoiceStatus).toBe('REFUNDED');
  });

  it('half refund returns PARTIALLY_REFUNDED + half VAT', () => {
    const r = computeRefundAccounting({
      invoiceTotal: 115,
      invoiceVatAmt: 15,
      alreadyRefundedAmount: 0,
      thisRefundAmount: 57.5,
    });
    expect(r.refundedVatPortion).toBe(7.5);
    expect(r.newRefundedAmount).toBe(57.5);
    expect(r.newRefundedVatAmt).toBe(7.5);
    expect(r.newInvoiceStatus).toBe('PARTIALLY_REFUNDED');
  });

  it('cumulative second partial refund completes the invoice', () => {
    const r = computeRefundAccounting({
      invoiceTotal: 115,
      invoiceVatAmt: 15,
      alreadyRefundedAmount: 57.5,
      thisRefundAmount: 57.5,
    });
    expect(r.newRefundedAmount).toBe(115);
    expect(r.newRefundedVatAmt).toBe(15);
    expect(r.newInvoiceStatus).toBe('REFUNDED');
  });

  it('zero-total invoice does not divide by zero', () => {
    const r = computeRefundAccounting({
      invoiceTotal: 0,
      invoiceVatAmt: 0,
      alreadyRefundedAmount: 0,
      thisRefundAmount: 0,
    });
    expect(r.refundedVatPortion).toBe(0);
    expect(r.newRefundedVatAmt).toBe(0);
    expect(r.newInvoiceStatus).toBe('REFUNDED');
  });

  it('handles 0.01 rounding tolerance — 114.99 of 115 still flips to REFUNDED', () => {
    const r = computeRefundAccounting({
      invoiceTotal: 115,
      invoiceVatAmt: 15,
      alreadyRefundedAmount: 0,
      thisRefundAmount: 114.99,
    });
    expect(r.newInvoiceStatus).toBe('REFUNDED');
  });
});
