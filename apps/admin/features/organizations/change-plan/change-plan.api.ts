import { adminRequest } from '@/lib/api-client';

export interface ChangePlanCommand {
  newPlanId: string;
}

export function changePlanForOrg(orgId: string, cmd: ChangePlanCommand): Promise<{ id: string }> {
  return adminRequest<{ id: string }>(`/billing/subscriptions/${orgId}/plan`, {
    method: 'PATCH',
    body: JSON.stringify(cmd),
  });
}
