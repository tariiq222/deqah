import { adminRequest } from '@/lib/api-client';
import type { PageMeta } from '@/lib/types';

export interface AuditLogEntry {
  id: string;
  superAdminUserId: string;
  actionType: string;
  organizationId: string | null;
  impersonationSessionId: string | null;
  reason?: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
}

export interface ListAuditLogParams {
  page: number;
  perPage: number;
  actionType?: string;
  organizationId?: string;
  superAdminUserId?: string;
  from?: string;
  to?: string;
}

export interface ListAuditLogResponse {
  items: AuditLogEntry[];
  meta: PageMeta;
}

export function listAuditLog(p: ListAuditLogParams): Promise<ListAuditLogResponse> {
  const search = new URLSearchParams({ page: String(p.page), perPage: String(p.perPage) });
  if (p.actionType && p.actionType !== 'all') search.set('actionType', p.actionType);
  if (p.organizationId?.trim()) search.set('organizationId', p.organizationId.trim());
  if (p.superAdminUserId?.trim()) search.set('superAdminUserId', p.superAdminUserId.trim());
  if (p.from) search.set('from', p.from);
  if (p.to) search.set('to', p.to);
  return adminRequest<ListAuditLogResponse>(`/audit-log?${search.toString()}`);
}
