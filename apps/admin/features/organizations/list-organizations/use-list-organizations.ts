import { useQuery } from '@tanstack/react-query';
import { listOrganizations, type ListOrganizationsParams } from './list-organizations.api';

export const organizationsListKey = (p: ListOrganizationsParams) =>
  [
    'organizations',
    'list',
    p.page,
    p.search ?? '',
    p.suspended ?? '',
    p.status ?? '',
    p.verticalId ?? '',
    p.planId ?? '',
  ] as const;

export function useListOrganizations(p: ListOrganizationsParams) {
  return useQuery({
    queryKey: organizationsListKey(p),
    queryFn: () => listOrganizations(p),
  });
}
