import { useQuery } from '@tanstack/react-query';
import { listVerticals } from './list-verticals.api';

export const verticalsListKey = ['verticals', 'list'] as const;

export function useListVerticals(page = 1, perPage = 20) {
  return useQuery({
    queryKey: [...verticalsListKey, page, perPage],
    queryFn: () => listVerticals(page, perPage),
  });
}
