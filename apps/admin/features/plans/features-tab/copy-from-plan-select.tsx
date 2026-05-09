'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@deqah/ui/primitives/select';
import { useListPlans } from '../list-plans/use-list-plans';
import { hydrateLimits } from '../plan-limits';
import type { PlanLimits } from '../plan-limits';

type Props = {
  onLimitsLoaded: (limits: PlanLimits, planNameEn: string) => void;
};

export function CopyFromPlanSelect({ onLimitsLoaded }: Props) {
  const { data: plans, isLoading } = useListPlans();

  const handleChange = (planId: string) => {
    const plan = plans?.find((p) => p.id === planId);
    if (!plan) return;
    const hydrated = hydrateLimits(plan.limits as Record<string, unknown>);
    onLimitsLoaded(hydrated, plan.nameEn);
  };

  return (
    <div className="flex items-center gap-3">
      {/* TODO i18n: "Start from existing plan:" — no key in plans.* namespace */}
      <p className="text-sm text-muted-foreground whitespace-nowrap">Start from existing plan:</p>
      <Select onValueChange={handleChange} disabled={isLoading}>
        <SelectTrigger className="w-56">
          {/* TODO i18n: "Choose a plan" — no key in plans.* namespace */}
          <SelectValue placeholder={isLoading ? 'Loading…' : 'Choose a plan'} />
        </SelectTrigger>
        <SelectContent>
          {(plans ?? []).map((plan) => (
            <SelectItem key={plan.id} value={plan.id}>
              <span>{plan.nameEn}</span>
              <span className="ms-1.5 text-xs text-muted-foreground font-mono">{plan.slug}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
