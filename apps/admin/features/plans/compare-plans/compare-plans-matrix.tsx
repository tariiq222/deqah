'use client';

import { useState, useCallback, Fragment } from 'react';
import { toast } from 'sonner';
import { Badge } from '@deqah/ui/primitives/badge';
import { Button } from '@deqah/ui/primitives/button';
import { Input } from '@deqah/ui/primitives/input';
import { Switch } from '@deqah/ui/primitives/switch';
import { Label } from '@deqah/ui/primitives/label';
import { FEATURE_CATALOG } from '@deqah/shared';
import type { PlanRow } from '../types';
import { QUANT_FIELD_MAP, hydrateLimits, type PlanLimits } from '../plan-limits';
import { useBatchUpdatePlans } from '../update-plan/use-batch-update-plans';

interface Props {
  plans: PlanRow[];
}

const GROUP_ORDER: Array<{ id: string; label: string }> = [
  { id: 'Booking & Scheduling', label: 'Booking & Scheduling' },
  { id: 'Client Engagement', label: 'Client Engagement' },
  { id: 'Finance & Compliance', label: 'Finance & Compliance' },
  { id: 'Operations', label: 'Operations' },
  { id: 'Platform', label: 'Platform' },
];

function parseInputNumber(s: string): number {
  if (s === '' || s === '-') return 0;
  const n = Number(s);
  return Number.isNaN(n) ? 0 : n;
}

function initLimits(plans: PlanRow[]): Record<string, PlanLimits> {
  const out: Record<string, PlanLimits> = {};
  for (const plan of plans) {
    out[plan.id] = hydrateLimits(plan.limits);
  }
  return out;
}

export function ComparePlansMatrix({ plans }: Props) {
  const sorted = [...plans].sort((a, b) => a.sortOrder - b.sortOrder);

  const [currentLimits, setCurrentLimits] = useState<Record<string, PlanLimits>>(() =>
    initLimits(sorted),
  );
  const [originalLimits, setOriginalLimits] = useState<Record<string, PlanLimits>>(() =>
    initLimits(sorted),
  );
  const [isSaving, setIsSaving] = useState(false);

  const { batchUpdate } = useBatchUpdatePlans();

  const grouped: Record<
    string,
    Array<[string, (typeof FEATURE_CATALOG)[keyof typeof FEATURE_CATALOG]]>
  > = {};
  for (const g of GROUP_ORDER) grouped[g.id] = [];
  for (const [key, entry] of Object.entries(FEATURE_CATALOG)) {
    (grouped[entry.group] ??= []).push([key, entry]);
  }

  const setLimit = useCallback(
    (planId: string, key: string, value: boolean | number) => {
      setCurrentLimits((prev) => ({
        ...prev,
        [planId]: { ...prev[planId], [key]: value },
      }));
    },
    [],
  );

  const isPlanDirty = useCallback(
    (planId: string): boolean => {
      const cur = currentLimits[planId];
      const orig = originalLimits[planId];
      if (!cur || !orig) return false;
      for (const k of Object.keys(orig) as Array<keyof PlanLimits>) {
        if (cur[k] !== orig[k]) return true;
      }
      return false;
    },
    [currentLimits, originalLimits],
  );

  const dirtyPlanIds = sorted.filter((p) => isPlanDirty(p.id)).map((p) => p.id);
  const dirtyCount = dirtyPlanIds.length;

  const handleCancel = () => {
    if (dirtyCount > 0) {
      if (!window.confirm('Discard all unsaved changes?')) return;
    }
    setCurrentLimits(initLimits(sorted));
  };

  const handleSave = async () => {
    if (dirtyCount === 0 || isSaving) return;

    const dirtyPlans = sorted.filter((p) => dirtyPlanIds.includes(p.id));
    const plansWithSubscribers = dirtyPlans.filter((p) => p._count.subscriptions > 0);

    if (plansWithSubscribers.length > 0) {
      const ok = window.confirm(
        `You're updating ${dirtyCount} plan${dirtyCount === 1 ? '' : 's'}. ` +
          `${plansWithSubscribers.length} of them have active subscribers. Continue?`,
      );
      if (!ok) return;
    }

    setIsSaving(true);
    try {
      const items = dirtyPlans.map((plan) => ({
        plan,
        limits: currentLimits[plan.id],
      }));

      const { succeeded, failed } = await batchUpdate(items);

      if (failed.length === 0) {
        toast.success(`Saved ${succeeded.length} plan${succeeded.length === 1 ? '' : 's'}`);
        setOriginalLimits((prev) => {
          const next = { ...prev };
          for (const planId of succeeded) next[planId] = { ...currentLimits[planId] };
          return next;
        });
      } else {
        toast.error(
          `${failed.length} of ${dirtyCount} plan${dirtyCount === 1 ? '' : 's'} failed: ${failed.map((f) => f.planId).join(', ')}`,
        );
        if (succeeded.length > 0) {
          setOriginalLimits((prev) => {
            const next = { ...prev };
            for (const planId of succeeded) next[planId] = { ...currentLimits[planId] };
            return next;
          });
        }
      }
    } finally {
      setIsSaving(false);
    }
  };

  const saveDisabled = dirtyCount === 0 || isSaving;

  const featureColWidth = 260;
  const planColWidth = 150;

  return (
    <>
      <div className="rounded-lg border border-border">
        {/* Sticky header row — rendered as a plain div, always visible */}
        <div className="flex border-b border-border bg-card" style={{ position: 'sticky', top: 0, zIndex: 20 }}>
          <div
            className="shrink-0 px-4 py-3 text-left font-medium text-muted-foreground uppercase tracking-wide text-xs"
            style={{ width: featureColWidth, minWidth: featureColWidth, boxShadow: 'inset -1px 0 0 hsl(var(--border))' }}
          >
            Feature
          </div>
          {sorted.map((plan) => {
            const subs = plan._count.subscriptions;
            const dirty = isPlanDirty(plan.id);
            return (
              <div
                key={plan.id}
                className="shrink-0 px-4 py-3 text-center font-medium"
                style={{ width: planColWidth, minWidth: planColWidth }}
              >
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs uppercase tracking-wide">{plan.slug}</span>
                    {dirty ? (
                      <span className="inline-block size-1.5 rounded-full bg-amber-500" aria-label="unsaved changes" />
                    ) : null}
                  </div>
                  {subs > 0 ? (
                    <Badge
                      variant="outline"
                      className="border-primary/30 bg-primary/10 px-1.5 py-0 font-mono text-[10px] tabular-nums text-primary"
                      title={`${subs} active subscriber${subs === 1 ? '' : 's'}`}
                    >
                      {subs}
                    </Badge>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* Scrollable body */}
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm" style={{ width: featureColWidth + planColWidth * sorted.length }}>
            <tbody>
              {GROUP_ORDER.map((g) => {
                const entries = grouped[g.id] ?? [];
                if (entries.length === 0) return null;
                return (
                  <Fragment key={g.id}>
                    <tr>
                      <td
                        colSpan={sorted.length + 1}
                        className="bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        style={{ width: featureColWidth + planColWidth * sorted.length }}
                      >
                        {g.label}
                      </td>
                    </tr>
                    {entries.map(([catalogKey, entry]) => (
                      <tr key={catalogKey} className="border-t border-border hover:bg-muted/20">
                        <td
                          className="sticky left-0 z-10 bg-card px-4 py-3"
                          style={{ width: featureColWidth, minWidth: featureColWidth, boxShadow: 'inset -1px 0 0 hsl(var(--border))' }}
                        >
                          <div className="space-y-0.5">
                            <span className="text-sm font-medium">{entry.nameEn}</span>
                            <p className="text-xs text-muted-foreground line-clamp-1">{entry.descEn}</p>
                          </div>
                        </td>
                        {sorted.map((plan) => {
                          const limits = currentLimits[plan.id];
                          if (!limits) return <td key={plan.id} style={{ width: planColWidth }} />;

                          if (entry.kind === 'boolean') {
                            const val = limits[catalogKey as keyof PlanLimits];
                            return (
                              <td key={plan.id} className="px-4 py-3 text-center" style={{ width: planColWidth }}>
                                <div className="flex justify-center">
                                  <Switch
                                    checked={val === true}
                                    onCheckedChange={(v) => setLimit(plan.id, catalogKey, v)}
                                    aria-label={`${entry.nameEn} for ${plan.slug}`}
                                  />
                                </div>
                              </td>
                            );
                          }

                          const fieldName = QUANT_FIELD_MAP[catalogKey as keyof typeof QUANT_FIELD_MAP];
                          if (!fieldName) {
                            return (
                              <td key={plan.id} className="px-4 py-3 text-center" style={{ width: planColWidth }}>
                                <span className="text-muted-foreground">—</span>
                              </td>
                            );
                          }
                          const raw = limits[fieldName as keyof PlanLimits];
                          const numVal = typeof raw === 'number' ? raw : 0;

                          return (
                            <td key={plan.id} className="px-4 py-3 text-center" style={{ width: planColWidth }}>
                              <Input
                                type="number"
                                className="w-20 text-right tabular-nums mx-auto"
                                value={String(numVal)}
                                onChange={(e) => setLimit(plan.id, fieldName, parseInputNumber(e.target.value))}
                                aria-label={`${entry.nameEn} for ${plan.slug}`}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border-t border-border px-2 py-6 mt-6">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 space-y-2">
            {dirtyCount === 0 ? (
              <p className="text-sm text-muted-foreground">
                No pending changes — edit any cell to enable saving.
              </p>
            ) : (
              <p className="text-sm">
                <span className="font-medium">
                  {dirtyCount} plan{dirtyCount === 1 ? '' : 's'} pending
                </span>
              </p>
            )}
          </div>
          <div className="flex items-end gap-2 pt-7">
            <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleSave()}
              disabled={saveDisabled}
            >
              {isSaving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
