'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@deqah/ui/primitives/input';
import { Label } from '@deqah/ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@deqah/ui/primitives/select';
import { useListVerticals } from '@/features/verticals/list-verticals/use-list-verticals';
import { generateSubdomainSafeSlug, validateSlug } from '@/lib/slug';
import type { WizardForm } from '../create-tenant-dialog';

export function isOrgStepValid(form: WizardForm): boolean {
  const v = validateSlug(form.slug.trim());
  return v.ok && form.nameAr.trim().length >= 2;
}

interface Props {
  form: WizardForm;
  set: (field: keyof WizardForm) => (value: string) => void;
}

export function OrgStep({ form, set }: Props) {
  const t = useTranslations('organizations.create');
  const { data: verticalsData } = useListVerticals();
  const verticals = verticalsData?.items;
  const slugDirtyRef = useRef(false);

  useEffect(() => {
    if (!slugDirtyRef.current && form.nameAr) {
      set('slug')(generateSubdomainSafeSlug(form.nameAr));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.nameAr]);

  const slugValidation = form.slug ? validateSlug(form.slug) : null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="tenant-name-ar">{t('nameAr')}</Label>
        <Input
          id="tenant-name-ar"
          value={form.nameAr}
          onChange={(e) => set('nameAr')(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tenant-name-en">{t('nameEn')}</Label>
        <Input
          id="tenant-name-en"
          value={form.nameEn}
          onChange={(e) => set('nameEn')(e.target.value)}
        />
      </div>

      <div className="space-y-1.5 md:col-span-2">
        <Label htmlFor="tenant-slug">{t('slugLabel')}</Label>
        <Input
          id="tenant-slug"
          value={form.slug}
          onChange={(e) => {
            slugDirtyRef.current = true;
            set('slug')(e.target.value);
          }}
          placeholder={t('slugPlaceholder')}
          autoComplete="off"
          dir="ltr"
        />
        <p className="text-sm text-muted-foreground" dir="ltr">
          https://{form.slug || '<slug>'}.deqah.net
        </p>
        {slugValidation && !slugValidation.ok && (
          <p className="text-sm text-destructive">{slugValidation.reason}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tenant-vertical">{t('verticalSlug')}</Label>
        <Select
          value={form.verticalSlug || '__none__'}
          onValueChange={(v) => set('verticalSlug')(v === '__none__' ? '' : v)}
        >
          <SelectTrigger id="tenant-vertical">
            <SelectValue placeholder={t('verticalSlug')} />
          </SelectTrigger>
          <SelectContent>
            {/* TODO i18n: — None — */}
            <SelectItem value="__none__">— None —</SelectItem>
            {verticals?.filter((v) => v.isActive).map((v) => (
              <SelectItem key={v.slug} value={v.slug}>
                {v.nameAr} ({v.slug})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
