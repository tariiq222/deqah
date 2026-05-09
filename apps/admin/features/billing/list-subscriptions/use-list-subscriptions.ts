import { useQuery } from '@tanstack/react-query';
import { listSubscriptions, type ListSubscriptionsParams } from './list-subscriptions.api';

export const subscriptionsListKey = (p: ListSubscriptionsParams) =>
  ['billing', 'subscriptions', 'list', p.page, p.status ?? '', p.planId ?? ''] as const;

export function useListSubscriptions(p: ListSubscriptionsParams) {
  return useQuery({
    queryKey: subscriptionsListKey(p),
    queryFn: () => listSubscriptions(p),
  });
}
