import { adminRequest } from '@/lib/api-client';
import type { SubscriptionInvoiceRow } from '../types';

export interface WaiveInvoiceCommand {
  invoiceId: string;
}

export function waiveInvoice({ invoiceId }: WaiveInvoiceCommand): Promise<SubscriptionInvoiceRow> {
  return adminRequest<SubscriptionInvoiceRow>(`/billing/invoices/${invoiceId}/waive`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
