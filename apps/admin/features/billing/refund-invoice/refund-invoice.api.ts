import { adminRequest } from '@/lib/api-client';
import type { SubscriptionInvoiceRow } from '../types';

export interface RefundInvoiceCommand {
  invoiceId: string;
  /** Amount in SAR. Omit for full refund of remaining. */
  amount?: number;
}

export function refundInvoice({
  invoiceId,
  amount,
}: RefundInvoiceCommand): Promise<SubscriptionInvoiceRow> {
  return adminRequest<SubscriptionInvoiceRow>(`/billing/invoices/${invoiceId}/refund`, {
    method: 'POST',
    body: JSON.stringify(amount === undefined ? {} : { amount }),
  });
}
