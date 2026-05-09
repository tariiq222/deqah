import { useQuery } from '@tanstack/react-query';
import {
  listImpersonationSessions,
  type ListImpersonationSessionsParams,
} from './list-impersonation-sessions.api';

export const impersonationSessionsKey = (p: ListImpersonationSessionsParams) =>
  ['impersonation-sessions', p.page, p.active ?? ''] as const;

export function useListImpersonationSessions(p: ListImpersonationSessionsParams) {
  return useQuery({
    queryKey: impersonationSessionsKey(p),
    queryFn: () => listImpersonationSessions(p),
  });
}
