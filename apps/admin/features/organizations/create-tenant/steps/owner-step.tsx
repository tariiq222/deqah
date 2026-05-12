'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@deqah/ui/primitives/button';
import { Input } from '@deqah/ui/primitives/input';
import { Label } from '@deqah/ui/primitives/label';
import { OwnerUserCombobox } from '../owner-user-combobox';
import type { WizardForm } from '../create-tenant-dialog';

interface Props {
  form: WizardForm;
  set: (field: keyof WizardForm) => (value: string) => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isOwnerStepValid(form: WizardForm): boolean {
  if (form.ownerMode === 'existing') {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      form.ownerUserId.trim(),
    );
  }
  const pw = form.ownerPassword;
  const passwordOk =
    pw === '' ||
    (pw.length >= 8 && /(?=.*[A-Z])(?=.*\d)/.test(pw));
  return (
    form.ownerName.trim().length >= 1 &&
    EMAIL_REGEX.test(form.ownerEmail.trim()) &&
    passwordOk
  );
}

export function OwnerStep({ form, set }: Props) {
  const t = useTranslations('organizations.create');

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          type="button"
          variant={form.ownerMode === 'existing' ? 'default' : 'outline'}
          size="sm"
          onClick={() => set('ownerMode')('existing')}
        >
          {t('ownerModeExisting')}
        </Button>
        <Button
          type="button"
          variant={form.ownerMode === 'new' ? 'default' : 'outline'}
          size="sm"
          onClick={() => set('ownerMode')('new')}
        >
          {t('ownerModeNew')}
        </Button>
      </div>

      {form.ownerMode === 'existing' ? (
        <div className="space-y-1.5">
          <Label>{t('ownerUserId')}</Label>
          <OwnerUserCombobox
            value={form.ownerUserId}
            onSelect={(userId, label) => {
              set('ownerUserId')(userId);
              set('ownerLabel')(label);
            }}
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="owner-name">{t('ownerName')}</Label>
            <Input
              id="owner-name"
              value={form.ownerName}
              onChange={(e) => set('ownerName')(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="owner-email">{t('ownerEmail')}</Label>
            <Input
              id="owner-email"
              type="email"
              value={form.ownerEmail}
              onChange={(e) => set('ownerEmail')(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="owner-phone">{t('ownerPhone')}</Label>
            <Input
              id="owner-phone"
              value={form.ownerPhone}
              onChange={(e) => set('ownerPhone')(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="owner-password">{t('ownerPassword')}</Label>
            <Input
              id="owner-password"
              type="password"
              value={form.ownerPassword}
              onChange={(e) => set('ownerPassword')(e.target.value)}
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">{t('ownerPasswordHint')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
