import { useQuery } from '@tanstack/react-query';
import { searchUsers, type SearchUsersParams } from './search-users.api';

export const usersSearchKey = (p: SearchUsersParams) =>
  ['users', 'search', p.page, p.search ?? '', p.organizationId ?? ''] as const;

export function useSearchUsers(p: SearchUsersParams) {
  return useQuery({
    queryKey: usersSearchKey(p),
    queryFn: () => searchUsers(p),
  });
}
