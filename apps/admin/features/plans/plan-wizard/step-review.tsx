'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@deqah/ui/primitives/button';
import { QUOTA_FIELDS, OVERAGE_FIELDS, FEATURE_FIELDS, type PlanLimits } from '../plan-limits';
import type { BasicsForm } from './step-basics';

interface Props {
  mode: 'create' | 'edit';
  basics: BasicsForm;
  limits: PlanLimits;
  initialSlug?: string;
  isActive?: boolean;
  onEditBasics: () => void;
  onEditFeatures: () => void;
}

export function StepReview({
  mode,
  basics,
  limits,
  initialSlug,
  isActive,
  onEditBasics,
  onEditFeatures,
}: Props) {
  const t = useTranslations('plans');
  const tc = useTranslations('common');
  const slug = mode === 'edit' ? (initialSlug ?? '') : basics.slug;

  const enabledCount = FEATURE_FIELDS.filter((f) => {
    const val = limits[f.key];
    return val === true;
  }).length;

  const nonZeroOverage = OVERAGE_FIELDS.filter((f) => {
    const val = limits[f.key];
    return typeof val === 'number' && val > 0;
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Left panel — Plan basics */}
        <div className="rounded-md border border-border bg-muted/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">{t('review.planBasics')}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onEditBasics}
              className="h-auto py-0.5 text-xs"
            >
              {tc('edit')}
            </Button>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{t('review.planCode')}</dt>
              <dd className="font-mono text-xs font-medium">{slug}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{t('review.nameAr')}</dt>
              <dd className="text-right">{basics.nameAr || '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{t('review.nameEn')}</dt>
              <dd className="text-right">{basics.nameEn || '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{t('review.monthlyPrice')}</dt>
              <dd className="font-mono tabular-nums">
                {basics.priceMonthly || '0'} {basics.currency}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{t('review.annualPrice')}</dt>
              <dd className="font-mono tabular-nums">
                {basics.priceAnnual || '0'} {basics.currency}
              </dd>
            </div>
            {mode === 'edit' && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t('review.statusLabel')}</dt>
                <dd>{isActive ? tc('active') : tc('inactive')}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Right panel — Limits & features */}
        <div className="rounded-md border border-border bg-muted/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">{t('review.limitsAndFeatures')}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onEditFeatures}
              className="h-auto py-0.5 text-xs"
            >
              {tc('edit')}
            </Button>
          </div>
          <div className="space-y-3">
            <table className="w-full text-sm">
              <tbody>
                {QUOTA_FIELDS.map((f) => {
                  const val = limits[f.key];
                  const display =
                    typeof val === 'number' && val === -1 ? t('review.unlimited') : String(val ?? '—');
                  return (
                    <tr key={f.key} className="border-b border-border/50 last:border-0">
                      <td className="py-1.5 text-muted-foreground">{f.label}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-xs">
                        {display}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <p className="text-sm text-muted-foreground">
              {t('review.featuresEnabled', { enabled: enabledCount, total: FEATURE_FIELDS.length })}
            </p>

            {nonZeroOverage.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{t('review.overageRates')}</p>
                {nonZeroOverage.map((f) => (
                  <div key={f.key} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{f.label}</span>
                    <span className="font-mono tabular-nums">{String(limits[f.key])}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="text-center text-sm text-muted-foreground">
        {t('wizard.reviewConfirm')}
      </p>
    </div>
  );
}
