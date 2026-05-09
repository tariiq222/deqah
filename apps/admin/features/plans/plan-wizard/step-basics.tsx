'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@deqah/ui/primitives/input';
import { Label } from '@deqah/ui/primitives/label';
import { Switch } from '@deqah/ui/primitives/switch';

export interface BasicsForm {
  slug: string;
  nameAr: string;
  nameEn: string;
  priceMonthly: string;
  priceAnnual: string;
  currency: string;
}

const SLUG_REGEX = /^[A-Z][A-Z0-9_]{1,31}$/;

export function slugIsValid(slug: string): boolean {
  return SLUG_REGEX.test(slug);
}

export function basicsIsValid(basics: BasicsForm, mode: 'create' | 'edit'): boolean {
  if (mode === 'create' && !slugIsValid(basics.slug)) return false;
  return (
    basics.nameAr.trim().length > 0 &&
    basics.nameEn.trim().length > 0 &&
    basics.priceMonthly !== '' &&
    basics.priceAnnual !== ''
  );
}

const SLUG_CHIPS = ['STARTER', 'TEAM_ANNUAL', 'ENTERPRISE_2026'] as const;

interface Props {
  mode: 'create' | 'edit';
  basics: BasicsForm;
  onChange: (next: BasicsForm) => void;
  initialSlug?: string;
  isActive?: boolean;
  onIsActiveChange?: (next: boolean) => void;
  showErrors?: boolean;
}

export function StepBasics({
  mode,
  basics,
  onChange,
  initialSlug,
  isActive,
  onIsActiveChange,
  showErrors = false,
}: Props) {
  const t = useTranslations('plans');
  const set = (field: keyof BasicsForm) => (value: string) =>
    onChange({ ...basics, [field]: value });

  // Per-field error computation (only shown when showErrors=true)
  const slugMissing = mode === 'create' && basics.slug.trim() === '';
  const slugInvalidFormat = mode === 'create' && basics.slug !== '' && !slugIsValid(basics.slug);
  const nameArMissing = basics.nameAr.trim().length === 0;
  const nameEnMissing = basics.nameEn.trim().length === 0;
  const priceMonthlyMissing = basics.priceMonthly === '';
  const priceAnnualMissing = basics.priceAnnual === '';

  const hasErrors =
    showErrors &&
    (slugMissing || slugInvalidFormat || nameArMissing || nameEnMissing ||
      priceMonthlyMissing || priceAnnualMissing);

  // Also show inline slug format error while typing (regardless of showErrors)
  const slugTypingInvalid = mode === 'create' && basics.slug !== '' && !slugIsValid(basics.slug);

  return (
    <div className="space-y-4">
      {hasErrors && (
        <div
          role="alert"
          className="bg-destructive/10 border border-destructive/30 text-destructive text-sm p-3 rounded-md"
        >
          {t('wizard.fixErrors')}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="wiz-slug">{t('basics.planCode')}</Label>
        {mode === 'create' ? (
          <>
            <Input
              id="wiz-slug"
              value={basics.slug}
              onChange={(e) => set('slug')(e.target.value.toUpperCase())}
              placeholder="STARTER"
              autoComplete="off"
              aria-invalid={slugTypingInvalid || (showErrors && (slugMissing || slugInvalidFormat))}
              aria-describedby={
                slugTypingInvalid || (showErrors && (slugMissing || slugInvalidFormat))
                  ? 'wiz-slug-error'
                  : 'wiz-slug-hint'
              }
            />
            <p id="wiz-slug-hint" className="text-xs text-muted-foreground">
              {t('basics.planCodeHint')}
            </p>
            <div className="flex items-center gap-1 flex-wrap">
              <p className="text-xs text-muted-foreground">{t('basics.planCodeExamples')}</p>
              {SLUG_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => set('slug')(chip)}
                  className="text-xs px-2 py-1 rounded-md bg-muted hover:bg-accent text-muted-foreground border border-border"
                >
                  {chip}
                </button>
              ))}
            </div>
            {(slugTypingInvalid || (showErrors && (slugMissing || slugInvalidFormat))) && (
              <p id="wiz-slug-error" className="text-xs text-destructive">
                {slugMissing
                  ? t('basics.errors.planCodeRequired')
                  : t('basics.errors.planCodeInvalid')}
              </p>
            )}
          </>
        ) : (
          <>
            <Input
              id="wiz-slug"
              value={initialSlug ?? ''}
              disabled
              readOnly
              aria-readonly="true"
            />
            <p className="text-xs text-muted-foreground">{t('basics.planCodeImmutable')}</p>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="wiz-nameAr">{t('basics.nameAr')}</Label>
          <Input
            id="wiz-nameAr"
            value={basics.nameAr}
            onChange={(e) => set('nameAr')(e.target.value)}
            placeholder="اسم الخطة"
            aria-invalid={showErrors && nameArMissing}
            aria-describedby={showErrors && nameArMissing ? 'wiz-nameAr-error' : undefined}
          />
          {showErrors && nameArMissing && (
            <p id="wiz-nameAr-error" className="text-xs text-destructive">
              {t('basics.errors.nameArRequired')}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wiz-nameEn">{t('basics.nameEn')}</Label>
          <Input
            id="wiz-nameEn"
            value={basics.nameEn}
            onChange={(e) => set('nameEn')(e.target.value)}
            placeholder="Plan name"
            aria-invalid={showErrors && nameEnMissing}
            aria-describedby={showErrors && nameEnMissing ? 'wiz-nameEn-error' : undefined}
          />
          {showErrors && nameEnMissing && (
            <p id="wiz-nameEn-error" className="text-xs text-destructive">
              {t('basics.errors.nameEnRequired')}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="wiz-monthly">{t('basics.monthlyPrice')}</Label>
          <Input
            id="wiz-monthly"
            type="number"
            min={0}
            value={basics.priceMonthly}
            onChange={(e) => set('priceMonthly')(e.target.value)}
            placeholder="0"
            aria-invalid={showErrors && priceMonthlyMissing}
            aria-describedby={showErrors && priceMonthlyMissing ? 'wiz-monthly-error' : undefined}
          />
          {showErrors && priceMonthlyMissing && (
            <p id="wiz-monthly-error" className="text-xs text-destructive">
              {t('basics.errors.monthlyRequired')}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wiz-annual">{t('basics.annualPrice')}</Label>
          <Input
            id="wiz-annual"
            type="number"
            min={0}
            value={basics.priceAnnual}
            onChange={(e) => set('priceAnnual')(e.target.value)}
            placeholder="0"
            aria-invalid={showErrors && priceAnnualMissing}
            aria-describedby={showErrors && priceAnnualMissing ? 'wiz-annual-error' : undefined}
          />
          {showErrors && priceAnnualMissing && (
            <p id="wiz-annual-error" className="text-xs text-destructive">
              {t('basics.errors.annualRequired')}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wiz-currency">{t('basics.currency')}</Label>
          <Input
            id="wiz-currency"
            value={basics.currency}
            onChange={(e) => set('currency')(e.target.value)}
            placeholder="SAR"
          />
        </div>
      </div>

      {mode === 'edit' && onIsActiveChange !== undefined && (
        <div className="flex items-center gap-3">
          <Switch
            id="wiz-isActive"
            checked={isActive ?? false}
            onCheckedChange={onIsActiveChange}
          />
          <Label htmlFor="wiz-isActive">{t('basics.isActive')}</Label>
        </div>
      )}
    </div>
  );
}
