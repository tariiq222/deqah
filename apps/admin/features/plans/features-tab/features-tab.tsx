'use client';
import { useMemo, useState } from 'react';
import { type FeatureKey } from '@deqah/shared';
import { Input } from '@deqah/ui/primitives/input';
import { Label } from '@deqah/ui/primitives/label';
import { FeatureSearch } from './feature-search';
import { PresetCards } from './preset-cards';
import { CopyFromPlanSelect } from './copy-from-plan-select';
import { FeatureGroupSection } from './feature-group-section';
import { InfoTooltip } from './info-tooltip';
import { filterCatalog } from './filter';
import type { PlanLimits } from '../plan-limits';
import { OVERAGE_FIELDS } from '../plan-limits';

const GROUP_ORDER: Array<{ id: string; label: string }> = [
  { id: 'Booking & Scheduling', label: 'Booking & Scheduling' },
  { id: 'Client Engagement', label: 'Client Engagement' },
  { id: 'Finance & Compliance', label: 'Finance & Compliance' },
  { id: 'Operations', label: 'Operations' },
  { id: 'Platform', label: 'Platform' },
];

type Props = {
  flatLimits: PlanLimits;
  onFlatLimitsChange: (next: PlanLimits) => void;
  idPrefix: string;
};

function parseInputNumber(s: string): number {
  if (s === '' || s === '-') return 0;
  const n = Number(s);
  return Number.isNaN(n) ? 0 : n;
}

// TODO i18n: OVERAGE_TOOLTIPS strings below — no keys in plans.* namespace
const OVERAGE_TOOLTIPS: Partial<Record<keyof PlanLimits, string>> = {
  overageRateBookings:
    'Cost charged per booking beyond the monthly quota. Set 0 to block overage entirely.',
  overageRateClients:
    'Cost charged per active client beyond the included limit. Set 0 to block overage.',
};

export function FeaturesTab({ flatLimits, onFlatLimitsChange, idPrefix }: Props) {
  const [query, setQuery] = useState('');
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const filtered = filterCatalog(query);
    const buckets: Record<string, typeof filtered> = {};
    for (const g of GROUP_ORDER) buckets[g.id] = [];
    for (const row of filtered) {
      const [, entry] = row;
      (buckets[entry.group] ??= []).push(row);
    }
    return buckets;
  }, [query]);

  const handleToggle = (key: FeatureKey, next: boolean) => {
    onFlatLimitsChange({ ...flatLimits, [key]: next });
  };

  const handleNumber = (key: keyof PlanLimits, value: number) => {
    onFlatLimitsChange({ ...flatLimits, [key]: value });
  };

  const handleCopyFromPlan = (limits: PlanLimits, planNameEn: string) => {
    onFlatLimitsChange(limits);
    setCopyNote(`Loaded limits from ${planNameEn}`);
  };

  return (
    <div className="space-y-4">
      {/* 1. Start from existing plan */}
      <CopyFromPlanSelect onLimitsLoaded={handleCopyFromPlan} />
      {copyNote !== null && (
        <p role="status" className="text-xs text-muted-foreground">
          {copyNote}
        </p>
      )}

      {/* 2. Preset cards + 3. Disable all */}
      <PresetCards limits={flatLimits} onLimitsChange={onFlatLimitsChange} />

      {/* 4. Search */}
      <FeatureSearch value={query} onChange={setQuery} />

      {/* 5. Feature groups */}
      <div className="space-y-3">
        {GROUP_ORDER.map((g) => (
          <FeatureGroupSection
            key={g.id}
            groupLabel={g.label}
            entries={grouped[g.id] ?? []}
            limits={flatLimits}
            onToggle={handleToggle}
            onNumberChange={handleNumber}
            idPrefix={idPrefix}
          />
        ))}
      </div>

      {/* 6. Overage pricing */}
      <div className="space-y-3 pt-2">
        {/* TODO i18n: "Overage pricing" — no key in plans.* namespace */}
        <p className="text-sm font-medium text-foreground">Overage pricing</p>
        <div className="grid grid-cols-3 gap-3">
          {OVERAGE_FIELDS.map((f) => {
            const tooltip = OVERAGE_TOOLTIPS[f.key];
            return (
              <div key={f.key} className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label htmlFor={`${idPrefix}-${f.key}`}>{f.label}</Label>
                  {tooltip !== undefined && (
                    <InfoTooltip content={tooltip} ariaLabel={`Info: ${f.label}`} />
                  )}
                </div>
                <Input
                  id={`${idPrefix}-${f.key}`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={String(flatLimits[f.key])}
                  onChange={(e) => handleNumber(f.key, parseInputNumber(e.target.value))}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
