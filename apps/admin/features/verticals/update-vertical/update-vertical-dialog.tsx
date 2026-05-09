'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@deqah/ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@deqah/ui/primitives/dialog';
import { Input } from '@deqah/ui/primitives/input';
import { Label } from '@deqah/ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@deqah/ui/primitives/select';
import { Textarea } from '@deqah/ui/primitives/textarea';
import type { VerticalRow } from '../types';
import { useUpdateVertical } from './use-update-vertical';

type TemplateFamily = 'MEDICAL' | 'CONSULTING' | 'SALON' | 'FITNESS';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vertical: VerticalRow;
}

interface FormState {
  nameAr: string;
  nameEn: string;
  templateFamily: TemplateFamily;
  descriptionAr: string;
  descriptionEn: string;
}

export function UpdateVerticalDialog({ open, onOpenChange, vertical }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {/* Inner form is keyed on the vertical id + open state so its lazy
            useState initializer rehydrates the form whenever the dialog
            opens for a (potentially different) vertical. */}
        {open ? (
          <UpdateVerticalForm
            key={`${vertical.id}-${open}`}
            vertical={vertical}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function UpdateVerticalForm({
  vertical,
  onClose,
}: {
  vertical: VerticalRow;
  onClose: () => void;
}) {
  const t = useTranslations('verticals.update');
  const mutation = useUpdateVertical();
  const [form, setForm] = useState<FormState>(() => ({
    nameAr: vertical.nameAr,
    nameEn: vertical.nameEn,
    templateFamily: vertical.templateFamily as TemplateFamily,
    descriptionAr: vertical.descriptionAr ?? '',
    descriptionEn: vertical.descriptionEn ?? '',
  }));

  const isValid =
    form.nameAr.trim().length > 0 &&
    form.nameEn.trim().length > 0;

  const set = (field: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const submit = () => {
    if (!isValid) return;
    mutation.mutate(
      {
        verticalId: vertical.id,
        nameAr: form.nameAr.trim(),
        nameEn: form.nameEn.trim(),
        templateFamily: form.templateFamily,
        descriptionAr: form.descriptionAr.trim() || null,
        descriptionEn: form.descriptionEn.trim() || null,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('title', { slug: vertical.slug })}</DialogTitle>
        <DialogDescription>
          {t('description')}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="uv-nameAr">{t('nameAr')}</Label>
          <Input
            id="uv-nameAr"
            value={form.nameAr}
            onChange={(e) => set('nameAr')(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="uv-nameEn">{t('nameEn')}</Label>
          <Input
            id="uv-nameEn"
            value={form.nameEn}
            onChange={(e) => set('nameEn')(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="uv-family">{t('templateFamily')}</Label>
          <Select
            value={form.templateFamily}
            onValueChange={(v) => set('templateFamily')(v as TemplateFamily)}
          >
            <SelectTrigger id="uv-family">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MEDICAL">MEDICAL</SelectItem>
              <SelectItem value="CONSULTING">CONSULTING</SelectItem>
              <SelectItem value="SALON">SALON</SelectItem>
              <SelectItem value="FITNESS">FITNESS</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="uv-descAr">{t('descriptionAr')}</Label>
          <Textarea
            id="uv-descAr"
            rows={2}
            value={form.descriptionAr}
            onChange={(e) => set('descriptionAr')(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="uv-descEn">{t('descriptionEn')}</Label>
          <Textarea
            id="uv-descEn"
            rows={2}
            value={form.descriptionEn}
            onChange={(e) => set('descriptionEn')(e.target.value)}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
          {t('cancel')}
        </Button>
        <Button onClick={submit} disabled={mutation.isPending || !isValid}>
          {mutation.isPending ? t('submitting') : t('submit')}
        </Button>
      </DialogFooter>
    </>
  );
}
