import { adminRequest } from '@/lib/api-client';
import type { OrganizationRow } from '../types';

export interface UpdateOrganizationCommand {
  organizationId: string;
  nameAr?: string;
  nameEn?: string | null;
  verticalSlug?: string | null;
  trialEndsAt?: string | null;
}

export function updateOrganization(cmd: UpdateOrganizationCommand): Promise<OrganizationRow> {
  const { organizationId, ...body } = cmd;
  return adminRequest<OrganizationRow>(`/organizations/${organizationId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
