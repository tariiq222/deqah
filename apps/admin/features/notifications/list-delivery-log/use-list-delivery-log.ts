import { useQuery } from '@tanstack/react-query';
import {
  listDeliveryLog,
  type DeliveryLogFilters,
  type DeliveryLogResponse,
} from './list-delivery-log.api';

export const deliveryLogKey = (filters: DeliveryLogFilters) =>
  ['notifications', 'delivery-log', filters] as const;

export function useListDeliveryLog(filters: DeliveryLogFilters = {}) {
  return useQuery<DeliveryLogResponse, Error>({
    queryKey: deliveryLogKey(filters),
    queryFn: () => listDeliveryLog(filters),
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}