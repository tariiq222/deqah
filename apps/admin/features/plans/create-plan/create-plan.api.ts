import { adminRequest } from '@/lib/api-client';
import type { PlanRow } from '../types';

export interface CreatePlanCommand {
  slug: string;
  nameAr: string;
  nameEn: string;
  priceMonthly: number;
  priceAnnual: number;
  currency?: string;
  limits: Record<string, unknown>;
  isActive?: boolean;
  sortOrder?: number;
}

export function createPlan(cmd: CreatePlanCommand): Promise<PlanRow> {
  return adminRequest<PlanRow>('/plans', {
    method: 'POST',
    body: JSON.stringify(cmd),
  });
}
