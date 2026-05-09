'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@deqah/ui/primitives/button';
import { FeaturesTab } from '../features-tab/features-tab';
import type { PlanLimits } from '../plan-limits';
import { StepBasics, basicsIsValid } from './step-basics';
import type { BasicsForm } from './step-basics';
import { StepReview } from './step-review';

type Step = 'basics' | 'features' | 'review';

export interface PlanWizardProps {
  mode: 'create' | 'edit';
  initialSlug?: string;
  initialBasics: BasicsForm;
  initialLimits: PlanLimits;
  isActive?: boolean;
  onIsActiveChange?: (next: boolean) => void;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: { basics: BasicsForm; limits: PlanLimits }) => void;
}

export function PlanWizard({
  mode,
  initialSlug,
  initialBasics,
  initialLimits,
  isActive,
  onIsActiveChange,
  isSubmitting,
  onCancel,
  onSubmit,
}: PlanWizardProps) {
  const t = useTranslations('plans');
  const [step, setStep] = useState<Step>('basics');
  const [basics, setBasics] = useState<BasicsForm>(initialBasics);
  const [limits, setLimits] = useState<PlanLimits>(initialLimits);
  const [showBasicsErrors, setShowBasicsErrors] = useState(false);

  const STEPS: Array<{ id: Step; label: string }> = [
    { id: 'basics', label: t('wizard.steps.basics') },
    { id: 'features', label: t('wizard.steps.features') },
    { id: 'review', label: t('wizard.steps.review') },
  ];

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const handleNext = () => {
    if (step === 'basics') {
      if (!basicsIsValid(basics, mode)) {
        setShowBasicsErrors(true);
        return;
      }
      setShowBasicsErrors(false);
      setStep('features');
    } else if (step === 'features') {
      setStep('review');
    }
  };

  const handleBack = () => {
    if (step === 'features') setStep('basics');
    else if (step === 'review') setStep('features');
  };

  const handleStepClick = (clickedStep: Step) => {
    const clickedIndex = STEPS.findIndex((s) => s.id === clickedStep);
    // Only allow navigating back, not forward
    if (clickedIndex < stepIndex) {
      setStep(clickedStep);
    }
  };

  const submitLabel = mode === 'create' ? t('wizard.createSubmit') : t('wizard.editSubmit');

  const idPrefix = mode === 'create' ? 'wiz-cp' : 'wiz-ep';

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-6">
      {/* Step indicator */}
      <div className="flex justify-center pt-2">
        <div className="flex items-start">
          {STEPS.map((s, idx) => {
            const sIndex = idx;
            const isDone = sIndex < stepIndex;
            const isCurrent = s.id === step;
            const isClickable = sIndex < stepIndex;
            return (
              <div key={s.id} className="flex items-center">
                <button
                  type="button"
                  onClick={() => handleStepClick(s.id)}
                  disabled={!isClickable}
                  className="flex flex-col items-center gap-1 disabled:cursor-default"
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  <div
                    className={[
                      'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors',
                      isCurrent || isDone
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground',
                    ].join(' ')}
                  >
                    {isDone ? (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <path
                          d="M2 7L5.5 10.5L12 3.5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      String(idx + 1)
                    )}
                  </div>
                  <span
                    className={[
                      'text-xs',
                      isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground',
                    ].join(' ')}
                  >
                    {s.label}
                  </span>
                </button>
                {idx < STEPS.length - 1 && (
                  <div
                    className={[
                      'mb-5 h-px w-16 mx-2',
                      sIndex < stepIndex ? 'bg-primary' : 'bg-border',
                    ].join(' ')}
                    aria-hidden="true"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div>
        {step === 'basics' && (
          <StepBasics
            mode={mode}
            basics={basics}
            onChange={setBasics}
            initialSlug={initialSlug}
            isActive={isActive}
            onIsActiveChange={onIsActiveChange}
            showErrors={showBasicsErrors}
          />
        )}
        {step === 'features' && (
          <FeaturesTab
            flatLimits={limits}
            onFlatLimitsChange={setLimits}
            idPrefix={idPrefix}
          />
        )}
        {step === 'review' && (
          <StepReview
            mode={mode}
            basics={basics}
            limits={limits}
            initialSlug={initialSlug}
            isActive={isActive}
            onEditBasics={() => setStep('basics')}
            onEditFeatures={() => setStep('features')}
          />
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <div>
          {step !== 'basics' && (
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={isSubmitting}
            >
              {t('wizard.back')}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {t('wizard.cancel')}
          </Button>
          {step !== 'review' ? (
            <Button
              type="button"
              onClick={handleNext}
            >
              {t('wizard.next')}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => onSubmit({ basics, limits })}
              disabled={isSubmitting}
            >
              {isSubmitting ? (mode === 'create' ? t('wizard.creating') : t('wizard.saving')) : submitLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
