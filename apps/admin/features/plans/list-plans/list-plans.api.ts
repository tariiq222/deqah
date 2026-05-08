import { adminRequest } from '@/lib/api-client';
import type { PageMeta } from '@/lib/types';
import type { PlanRow } from '../types';

interface ListPlansResponse {
  items: PlanRow[];
  meta: PageMeta;
}

export async function listPlans(): Promise<PlanRow[]> {
  const data = await adminRequest<ListPlansResponse>('/plans');
  return data.items;
}
