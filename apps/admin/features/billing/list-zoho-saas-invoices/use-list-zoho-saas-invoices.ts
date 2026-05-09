import { useQuery } from '@tanstack/react-query';
import {
  listZohoSaasInvoices,
  type ListZohoSaasInvoicesParams,
} from './list-zoho-saas-invoices.api';

export const zohoSaasInvoicesListKey = (p: ListZohoSaasInvoicesParams) =>
  ['billing', 'zoho-saas-invoices', p.page, p.perPage, p.status ?? '', p.organizationId ?? '', p.zohoMirrored ?? ''] as const;

export function useListZohoSaasInvoices(p: ListZohoSaasInvoicesParams) {
  return useQuery({
    queryKey: zohoSaasInvoicesListKey(p),
    queryFn: () => listZohoSaasInvoices(p),
  });
}
