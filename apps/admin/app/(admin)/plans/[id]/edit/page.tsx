'use client';

import Link from 'next/link';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@deqah/ui/primitives/button';
import { Input } from '@deqah/ui/primitives/input';
import { Label } from '@deqah/ui/primitives/label';
import { Skeleton } from '@deqah/ui/primitives/skeleton';
import { Textarea } from '@deqah/ui/primitives/textarea';
import { useListPlans } from '@/features/plans/list-plans/use-list-plans';
import { PlanFormTabs } from '@/features/plans/plan-form-tabs';
import { DEFAULT_PLAN_LIMITS, type PlanLimits } from '@/features/plans/plan-limits';
import { useUpdatePlan } from '@/features/plans/update-plan/use-update-plan';
import { Breadcrumbs } from '@/components/breadcrumbs';

interface EditForm {
  nameAr: string;
  nameEn: string;
  priceMonthly: string;
  priceAnnual: string;
  currency: string;
  isActive: boolean;
  reason: string;
}

export default function EditPlanPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const { data: plans, isLoading } = useListPlans();
  const mutation = useUpdatePlan();
  const [activeTab, setActiveTab] = useState('general');

  const plan = plans?.find((p) => p.id === id);

  const [form, setForm] = useState<EditForm>({
    nameAr: '',
    nameEn: '',
    priceMonthly: '',
    priceAnnual: '',
    currency: 'SAR',
    isActive: true,
    reason: '',
  });
  const [limits, setLimits] = useState<PlanLimits>(DEFAULT_PLAN_LIMITS);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (plan && !initialized) {
      setForm({
        nameAr: plan.nameAr,
        nameEn: plan.nameEn,
        priceMonthly: String(plan.priceMonthly),
        priceAnnual: String(plan.priceAnnual),
        currency: plan.currency,
        isActive: plan.isActive,
        reason: '',
      });
      setLimits({ ...DEFAULT_PLAN_LIMITS, ...(plan.limits as Partial<PlanLimits>) });
      setInitialized(true);
    }
  }, [plan, initialized]);

  const isValid =
    form.nameAr.trim().length > 0 &&
    form.nameEn.trim().length > 0 &&
    form.priceMonthly !== '' &&
    form.priceAnnual !== '' &&
    form.reason.trim().length >= 10;

  const set =
    (field: keyof Omit<EditForm, 'isActive'>) => (value: string) =>
      setForm((prev) => ({ ...prev, [field]: value }));

  const submit = () => {
    if (!isValid) return;
    mutation.mutate(
      {
        planId: id,
        nameAr: form.nameAr.trim(),
        nameEn: form.nameEn.trim(),
        priceMonthly: Number(form.priceMonthly),
        priceAnnual: Number(form.priceAnnual),
        currency: form.currency.trim() || 'SAR',
        isActive: form.isActive,
        limits: { ...limits },
        reason: form.reason.trim(),
      },
      { onSuccess: () => router.push('/plans') },
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Link href="/plans" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to plans
          </Link>
          <Skeleton className="mt-2 h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-80" />
        </div>
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="space-y-4">
        <Link href="/plans" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to plans
        </Link>
        <p className="text-sm text-muted-foreground">Plan not found.</p>
      </div>
    );
  }

  const general = (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="ep-slug">Slug</Label>
        <Input
          id="ep-slug"
          value={plan.slug}
          disabled
          readOnly
          aria-readonly="true"
        />
        <p className="text-xs text-muted-foreground">Slug is immutable and cannot be changed.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ep-nameAr">Name (Arabic)</Label>
          <Input
            id="ep-nameAr"
            value={form.nameAr}
            onChange={(e) => set('nameAr')(e.target.value)}
            placeholder="اسم الخطة"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ep-nameEn">Name (English)</Label>
          <Input
            id="ep-nameEn"
            value={form.nameEn}
            onChange={(e) => set('nameEn')(e.target.value)}
            placeholder="Plan name"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ep-monthly">Monthly price</Label>
          <Input
            id="ep-monthly"
            type="number"
            min={0}
            value={form.priceMonthly}
            onChange={(e) => set('priceMonthly')(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ep-annual">Annual price</Label>
          <Input
            id="ep-annual"
            type="number"
            min={0}
            value={form.priceAnnual}
            onChange={(e) => set('priceAnnual')(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ep-currency">Currency</Label>
          <Input
            id="ep-currency"
            value={form.currency}
            onChange={(e) => set('currency')(e.target.value)}
            placeholder="SAR"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ep-isActive">Active</Label>
        <div className="flex items-center gap-2">
          <input
            id="ep-isActive"
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-sm text-muted-foreground">Plan is active and available</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ep-reason">Reason (min 10 chars)</Label>
        <Textarea
          id="ep-reason"
          rows={3}
          value={form.reason}
          onChange={(e) => set('reason')(e.target.value)}
          placeholder="Reason for updating this plan…"
        />
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <Breadcrumbs pathname={pathname} />
      <div>
        <Link href="/plans" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to plans
        </Link>
        <h2 className="mt-2 text-2xl font-semibold">Edit plan</h2>
        <p className="text-sm text-muted-foreground">
          Update this subscription plan. Reason is written to the audit log.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <PlanFormTabs
          general={general}
          activeTab={activeTab}
          onActiveTabChange={setActiveTab}
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => router.push('/plans')}
          disabled={mutation.isPending}
        >
          Cancel
        </Button>
        <Button onClick={submit} disabled={mutation.isPending || !isValid}>
          {mutation.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
