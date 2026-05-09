'use client';

import { useState } from 'react';
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
import { useCreateVertical } from './use-create-vertical';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_FORM = {
  slug: '',
  nameAr: '',
  nameEn: '',
  templateFamily: '' as 'MEDICAL' | 'CONSULTING' | 'SALON' | 'FITNESS' | '',
  descriptionAr: '',
  descriptionEn: '',
};

export function CreateVerticalDialog({ open, onOpenChange }: Props) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const mutation = useCreateVertical();

  const isValid =
    form.slug.trim().length > 0 &&
    form.nameAr.trim().length > 0 &&
    form.nameEn.trim().length > 0 &&
    form.templateFamily !== '';

  const reset = () => setForm(DEFAULT_FORM);

  const set = (field: keyof typeof DEFAULT_FORM) => (value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const submit = () => {
    if (!isValid || form.templateFamily === '') return;
    mutation.mutate(
      {
        slug: form.slug.trim(),
        nameAr: form.nameAr.trim(),
        nameEn: form.nameEn.trim(),
        templateFamily: form.templateFamily,
        descriptionAr: form.descriptionAr.trim() || undefined,
        descriptionEn: form.descriptionEn.trim() || undefined,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          reset();
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create vertical</DialogTitle>
          <DialogDescription>
            Add a new clinic archetype. This action is written to the audit log.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cv-slug">Slug (kebab-case)</Label>
            <Input
              id="cv-slug"
              value={form.slug}
              onChange={(e) => set('slug')(e.target.value)}
              placeholder="e.g. general-medicine"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cv-nameAr">Name (Arabic)</Label>
            <Input
              id="cv-nameAr"
              value={form.nameAr}
              onChange={(e) => set('nameAr')(e.target.value)}
              placeholder="اسم التخصص"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cv-nameEn">Name (English)</Label>
            <Input
              id="cv-nameEn"
              value={form.nameEn}
              onChange={(e) => set('nameEn')(e.target.value)}
              placeholder="Vertical name"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cv-family">Template family</Label>
            <Select
              value={form.templateFamily}
              onValueChange={(v) =>
                set('templateFamily')(v as 'MEDICAL' | 'CONSULTING' | 'SALON' | 'FITNESS')
              }
            >
              <SelectTrigger id="cv-family">
                <SelectValue placeholder="Select family…" />
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
            <Label htmlFor="cv-descAr">Description (Arabic, optional)</Label>
            <Textarea
              id="cv-descAr"
              rows={2}
              value={form.descriptionAr}
              onChange={(e) => set('descriptionAr')(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cv-descEn">Description (English, optional)</Label>
            <Textarea
              id="cv-descEn"
              rows={2}
              value={form.descriptionEn}
              onChange={(e) => set('descriptionEn')(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              reset();
            }}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={mutation.isPending || !isValid}>
            {mutation.isPending ? 'Creating…' : 'Create vertical'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
