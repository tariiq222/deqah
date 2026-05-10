import { describe, expect, it, vi } from 'vitest';
import { useListAuditLog, auditLogListKey } from '@/features/audit-log/list-audit-log/use-list-audit-log';

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({
    data: undefined,
    isLoading: true,
    error: null,
  })),
}));

describe('useListAuditLog', () => {
  it('exports correct auditLogListKey function', () => {
    const params = {
      page: 1,
      perPage: 20,
      actionType: 'USER_CREATED',
      organizationId: 'org-1',
    };
    const key = auditLogListKey(params);

    expect(key).toContain('audit-log');
    expect(key).toContain('list');
    expect(key).toContain(1);
    expect(key).toContain('USER_CREATED');
    expect(key).toContain('org-1');
  });

  it('auditLogListKey handles all optional params', () => {
    const params = {
      page: 1,
      perPage: 20,
      actionType: 'USER_CREATED',
      organizationId: 'org-1',
      superAdminUserId: 'admin-1',
      from: '2024-01-01',
      to: '2024-12-31',
    };
    const key = auditLogListKey(params);

    expect(key).toHaveLength(8);
  });
});
