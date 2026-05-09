'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@deqah/ui/primitives/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@deqah/ui/primitives/dialog';
import { Input } from '@deqah/ui/primitives/input';
import { Label } from '@deqah/ui/primitives/label';
import type { OrganizationDetail } from '../types';
import { useUpdateOrganization } from './use-update-organization';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization: OrganizationDetail;
}

export function UpdateOrganizationDialog({ open, onOpenChange, organization }: Props) {
  const t = useTranslations('organizations.update');
  const initial = useMemo(
    () => ({
      nameAr: organization.nameAr,
      nameEn: organization.nameEn ?? '',
      verticalSlug: '',
      trialEndsAt: toDatetimeLocal(organization.trialEndsAt),
    }),
    [organization.nameAr, organization.nameEn, organization.trialEndsAt],
  );
  const [form, setForm] = useState(initial);
  const mutation = useUpdateOrganization(organization.id);

  const canSubmit = form.nameAr.trim().length >= 2;

  const reset = () => {
    setForm(initial);
    mutation.reset();
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && !mutation.isPending) reset();
    onOpenChange(next);
  };

  const set = (field: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || mutation.isPending) return;

    mutation.mutate(
      {
        nameAr: form.nameAr.trim(),
        nameEn: form.nameEn.trim() || null,
        verticalSlug: form.verticalSlug.trim() || undefined,
        trialEndsAt: form.trialEndsAt ? new Date(form.trialEndsAt).toISOString() : undefined,
      },
      {
        onSuccess: () => handleOpenChange(false),
      },
    );
  };

  const errorMessage = mutation.error instanceof Error ? mutation.error.message : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="update-name-ar">{t('nameAr')}</Label>
                <Input
                  id="update-name-ar"
                  value={form.nameAr}
                  onChange={(event) => set('nameAr')(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="update-name-en">{t('nameEn')}</Label>
                <Input
                  id="update-name-en"
                  value={form.nameEn}
                  onChange={(event) => set('nameEn')(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="update-vertical">{t('verticalSlug')}</Label>
                <Input
                  id="update-vertical"
                  value={form.verticalSlug}
                  onChange={(event) => set('verticalSlug')(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="update-trial">{t('trialEndsAt')}</Label>
                <Input
                  id="update-trial"
                  type="datetime-local"
                  value={form.trialEndsAt}
                  onChange={(event) => set('trialEndsAt')(event.target.value)}
                />
              </div>
            </div>
            {errorMessage ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {errorMessage}
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={mutation.isPending}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={mutation.isPending || !canSubmit}>
              {mutation.isPending ? t('submitting') : t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function toDatetimeLocal(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
}
