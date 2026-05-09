import { adminRequest } from '@/lib/api-client';

export interface ArchiveOrganizationCommand {
  organizationId: string;
}

export function archiveOrganization(cmd: ArchiveOrganizationCommand): Promise<void> {
  return adminRequest<void>(`/organizations/${cmd.organizationId}/archive`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
