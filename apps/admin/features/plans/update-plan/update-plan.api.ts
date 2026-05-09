import { adminRequest } from '@/lib/api-client';
import type { PlanRow } from '../types';

export interface UpdatePlanCommand {
  planId: string;
  nameAr?: string;
  nameEn?: string;
  priceMonthly?: number;
  priceAnnual?: number;
  currency?: string;
  limits?: Record<string, unknown>;
  isActive?: boolean;
  isVisible?: boolean;
  sortOrder?: number;
}

export function updatePlan({ planId, ...body }: UpdatePlanCommand): Promise<PlanRow> {
  return adminRequest<PlanRow>(`/plans/${planId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
