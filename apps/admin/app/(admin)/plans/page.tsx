'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@deqah/ui/primitives/button';
import { useListPlans } from '@/features/plans/list-plans/use-list-plans';
import { PlansTable } from '@/features/plans/list-plans/plans-table';
import { DeletePlanDialog } from '@/features/plans/delete-plan/delete-plan-dialog';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ErrorBanner } from '@/components/error-banner';

export default function PlansPage() {
  const pathname = usePathname();
  const { data, isLoading, error, refetch } = useListPlans();
  const [deletePlan, setDeletePlan] = useState<PlanRow | null>(null);

  return (
    <div className="space-y-6">
      <Breadcrumbs pathname={pathname} />
      {/* TODO Phase 6.4 follow-up: wire stats once BE list endpoint exposes counts (totalActive, totalVisible, etc.) */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Plans</h2>
          <p className="text-sm text-muted-foreground">Subscription plans available to tenants.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/plans/edit">Edit Features & Limits</Link>
          </Button>
          <Button asChild>
            <Link href="/plans/new">+ Create Plan</Link>
          </Button>
        </div>
      </div>

      {error ? (
        <ErrorBanner error={error} onRetry={() => void refetch()} context="page:plans" />
      ) : null}

      <PlansTable
        items={data}
        isLoading={isLoading}
        onDelete={(plan) => setDeletePlan(plan)}
      />

      {deletePlan ? (
        <DeletePlanDialog
          open={deletePlan !== null}
          onOpenChange={(open) => { if (!open) setDeletePlan(null); }}
          plan={deletePlan}
        />
      ) : null}
    </div>
  );
}
