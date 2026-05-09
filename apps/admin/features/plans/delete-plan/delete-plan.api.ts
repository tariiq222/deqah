import { adminRequest } from '@/lib/api-client';

export interface DeletePlanCommand {
  planId: string;
}

export function deletePlan({ planId }: DeletePlanCommand): Promise<void> {
  return adminRequest<void>(`/plans/${planId}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  });
}
