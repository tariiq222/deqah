import { adminRequest } from '@/lib/api-client';

export interface ChangePlanForOrgCommand {
  organizationId: string;
  newPlanId: string;
}

export interface PlanOption {
  id: string;
  slug: string;
  nameEn: string;
  priceMonthly: string | number;
  isActive: boolean;
}

export function changePlanForOrg({
  organizationId,
  newPlanId,
}: ChangePlanForOrgCommand): Promise<unknown> {
  return adminRequest(`/billing/subscriptions/${organizationId}/plan`, {
    method: 'PATCH',
    body: JSON.stringify({ newPlanId }),
  });
}

export function listPlanOptions(): Promise<PlanOption[]> {
  return adminRequest<PlanOption[]>('/plans');
}
