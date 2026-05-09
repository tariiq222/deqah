import { useQuery } from '@tanstack/react-query';
import {
  listSubscriptionInvoices,
  type ListSubscriptionInvoicesParams,
} from './list-subscription-invoices.api';

export const subscriptionInvoicesListKey = (p: ListSubscriptionInvoicesParams) =>
  [
    'billing',
    'invoices',
    'list',
    p.page,
    p.status ?? '',
    p.organizationId ?? '',
    p.fromDate ?? '',
    p.toDate ?? '',
    p.includeDrafts ?? false,
  ] as const;

export function useListSubscriptionInvoices(p: ListSubscriptionInvoicesParams) {
  return useQuery({
    queryKey: subscriptionInvoicesListKey(p),
    queryFn: () => listSubscriptionInvoices(p),
  });
}
