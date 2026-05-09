'use client';
import { useState } from 'react';
import type { FeatureKey } from '@deqah/shared';
import { FeatureRow } from './feature-row';
import { InfoTooltip } from './info-tooltip';
import type { CatalogEntry } from './filter';
import type { PlanLimits } from '../plan-limits';
import { QUANT_FIELD_MAP } from '../plan-limits';

// TODO i18n: QUOTA_TOOLTIP string — no key in plans.* namespace
const QUOTA_TOOLTIP =
  'Set to -1 for unlimited. Set 0 to disable this feature entirely.';

// Quota hints per quantitative key (kept as inline helper text below the input)
const QUANT_HINTS: Partial<Record<FeatureKey, string>> = {
  branches: '-1 = unlimited',
  employees: '-1 = unlimited',
  services: '-1 = unlimited',
  monthly_bookings: '-1 = unlimited',
};

function isQuantEnabled(limits: PlanLimits, key: FeatureKey): boolean {
  const fieldMap = QUANT_FIELD_MAP as Partial<Record<string, keyof PlanLimits>>;
  const f = fieldMap[key];
  if (!f) return false;
  const v = limits[f];
  return typeof v === 'number' && v !== 0;
}

type Props = {
  groupLabel: string;
  entries: Array<[FeatureKey, CatalogEntry]>;
  limits: PlanLimits;
  onToggle: (key: FeatureKey, next: boolean) => void;
  onNumberChange: (key: keyof PlanLimits, value: number) => void;
  idPrefix: string;
};

export function FeatureGroupSection({
  groupLabel,
  entries,
  limits,
  onToggle,
  onNumberChange,
  idPrefix,
}: Props) {
  const [open, setOpen] = useState(true);
  const total = entries.length;

  const enabled = entries.filter(([k, entry]) => {
    if (entry.kind === 'quantitative') return isQuantEnabled(limits, k);
    return limits[k as keyof PlanLimits] === true;
  }).length;

  if (total === 0) return null;

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="rounded-lg border border-border bg-card"
    >
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3">
        <span className="text-sm font-semibold">{groupLabel}</span>
        <span className="text-xs text-muted-foreground">{enabled} enabled / {total} total</span>
      </summary>
      <div className="px-4 pb-2">
        {entries.map(([key, entry]) => {
          if (entry.kind === 'quantitative') {
            const fieldMap = QUANT_FIELD_MAP as Partial<Record<string, keyof PlanLimits>>;
            const field = fieldMap[key];
            const quotaValue = field !== undefined ? (limits[field] as number | undefined) : undefined;
            const hasHint = key in QUANT_HINTS;
            return (
              <FeatureRow
                key={key}
                featureKey={key}
                entry={entry}
                idPrefix={idPrefix}
                kind="quantitative"
                quotaValue={quotaValue}
                onQuotaChange={field !== undefined ? (v) => onNumberChange(field, v) : undefined}
                quotaHint={QUANT_HINTS[key]}
                quotaTooltip={hasHint ? QUOTA_TOOLTIP : undefined}
              />
            );
          }
          return (
            <FeatureRow
              key={key}
              featureKey={key}
              entry={entry}
              idPrefix={idPrefix}
              kind="boolean"
              enabled={limits[key as keyof PlanLimits] === true}
              onToggle={(v) => onToggle(key, v)}
            />
          );
        })}
      </div>
    </details>
  );
}
