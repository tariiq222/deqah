import { useQuery } from '@tanstack/react-query';
import { listAuditLog, type ListAuditLogParams } from './list-audit-log.api';

export const auditLogListKey = (p: ListAuditLogParams) =>
  [
    'audit-log',
    'list',
    p.page,
    p.actionType ?? '',
    p.organizationId ?? '',
    p.superAdminUserId ?? '',
    p.from ?? '',
    p.to ?? '',
  ] as const;

export function useListAuditLog(p: ListAuditLogParams) {
  return useQuery({
    queryKey: auditLogListKey(p),
    queryFn: () => listAuditLog(p),
  });
}
