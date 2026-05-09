'use client';

import { useState } from 'react';
import { Button } from '@deqah/ui/primitives/button';
import { applyPresetFlat } from './presets';
import type { PlanLimits } from '../plan-limits';
import { FEATURE_CATALOG, type FeatureKey } from '@deqah/shared';

type CardPreset = 'STARTER' | 'PRO' | 'ENTERPRISE';

type Props = {
  limits: PlanLimits;
  onLimitsChange: (next: PlanLimits) => void;
};

// TODO i18n: PRESET_META label/desc strings — no keys in plans.* namespace
const PRESET_META: Array<{ kind: CardPreset; label: string; desc: string }> = [
  { kind: 'STARTER', label: 'Starter', desc: 'Essential features for new clinics' },
  { kind: 'PRO', label: 'Pro', desc: 'Common features for growing clinics' },
  { kind: 'ENTERPRISE', label: 'Enterprise', desc: 'All features enabled' },
];

// "Starter" preset = DISABLE_ALL + 4 baseline features
const STARTER_EXTRAS: Array<keyof PlanLimits> = [
  'recurring_bookings',
  'waitlist',
  'email_templates',
  'activity_log',
];

function countEnabledAfterPreset(preset: CardPreset): number {
  if (preset === 'ENTERPRISE') {
    return Object.values(FEATURE_CATALOG).filter((e) => e.kind === 'boolean').length;
  }
  if (preset === 'PRO') {
    return Object.values(FEATURE_CATALOG).filter(
      (e) => e.kind === 'boolean' && e.tier === 'PRO',
    ).length;
  }
  // STARTER
  return STARTER_EXTRAS.length;
}

function applyStarter(prev: PlanLimits): PlanLimits {
  // "Starter" preset = DISABLE_ALL + 4 baseline features
  const disabled = applyPresetFlat(prev, 'DISABLE_ALL');
  const next = { ...disabled };
  for (const key of STARTER_EXTRAS) {
    (next as Record<string, unknown>)[key as string] = true;
  }
  return next;
}

export function PresetCards({ limits, onLimitsChange }: Props) {
  const [activePreset, setActivePreset] = useState<CardPreset | null>(null);

  const handlePreset = (kind: CardPreset) => {
    setActivePreset(kind);
    if (kind === 'STARTER') {
      onLimitsChange(applyStarter(limits));
    } else {
      onLimitsChange(applyPresetFlat(limits, kind));
    }
  };

  const handleDisableAll = () => {
    setActivePreset(null);
    onLimitsChange(applyPresetFlat(limits, 'DISABLE_ALL'));
  };

  return (
    <div className="space-y-3">
      {/* TODO i18n: "Apply a preset" — no key in plans.* namespace */}
      <p className="text-sm font-medium text-foreground">Apply a preset</p>
      <div className="grid grid-cols-3 gap-3">
        {PRESET_META.map((p) => {
          const isActive = activePreset === p.kind;
          const count = countEnabledAfterPreset(p.kind);
          return (
            <button
              key={p.kind}
              type="button"
              onClick={() => handlePreset(p.kind)}
              className={[
                'flex flex-col gap-1 rounded-lg border p-3 text-start transition-colors',
                isActive
                  ? 'ring-2 ring-primary border-primary bg-primary/5'
                  : 'border-border bg-card hover:bg-accent',
              ].join(' ')}
              aria-pressed={isActive}
            >
              <span className="text-sm font-semibold text-foreground">{p.label}</span>
              {/* TODO i18n: preset desc "{p.desc}" — no key in plans.* namespace */}
              <span className="text-xs text-muted-foreground">{p.desc}</span>
              {/* TODO i18n: "{count} features" — no key in plans.* namespace */}
              <span className="text-xs font-medium text-primary mt-1">{count} features</span>
            </button>
          );
        })}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleDisableAll}
        className="text-muted-foreground"
      >
        {/* TODO i18n: "Disable all" — no key in plans.* namespace */}
        Disable all
      </Button>
    </div>
  );
}
