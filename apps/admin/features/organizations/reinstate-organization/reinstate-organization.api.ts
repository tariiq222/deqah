import { adminRequest } from '@/lib/api-client';

export interface ReinstateOrganizationCommand {
  organizationId: string;
}

export function reinstateOrganization(cmd: ReinstateOrganizationCommand): Promise<void> {
  return adminRequest<void>(`/organizations/${cmd.organizationId}/reinstate`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
