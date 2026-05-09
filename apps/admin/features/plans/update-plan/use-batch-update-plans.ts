import { useQueryClient } from '@tanstack/react-query';
import { updatePlan } from './update-plan.api';
import { plansListKey } from '../list-plans/use-list-plans';
import type { PlanRow } from '../types';
import { mergeLimits } from '../plan-limits';
import type { PlanLimits } from '../plan-limits';

export interface BatchUpdateItem {
  plan: PlanRow;
  limits: PlanLimits;
}

export interface BatchUpdateResult {
  succeeded: string[];
  failed: Array<{ planId: string; error: string }>;
}

/**
 * Returns a function that updates multiple plans in parallel via Promise.allSettled,
 * then invalidates the plans list query. Caller receives a BatchUpdateResult so it
 * can handle partial failures gracefully.
 */
export function useBatchUpdatePlans() {
  const qc = useQueryClient();

  async function batchUpdate(items: BatchUpdateItem[]): Promise<BatchUpdateResult> {
    const results = await Promise.allSettled(
      items.map((item) =>
        updatePlan({
          planId: item.plan.id,
          nameAr: item.plan.nameAr,
          nameEn: item.plan.nameEn,
          priceMonthly: Number(item.plan.priceMonthly),
          priceAnnual: Number(item.plan.priceAnnual),
          currency: item.plan.currency,
          limits: mergeLimits(item.plan.limits, item.limits),
        }),
      ),
    );

    const succeeded: string[] = [];
    const failed: Array<{ planId: string; error: string }> = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const planId = items[i].plan.id;
      if (result.status === 'fulfilled') {
        succeeded.push(planId);
      } else {
        const err = result.reason;
        failed.push({
          planId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await qc.invalidateQueries({ queryKey: plansListKey });

    return { succeeded, failed };
  }

  return { batchUpdate };
}
