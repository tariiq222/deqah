'use client';
import { Button } from '@deqah/ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@deqah/ui/primitives/dialog';
import { FEATURE_CATALOG, type FeatureKey } from '@deqah/shared';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  downgrades: FeatureKey[];
  activeSubscribers: number;
  onConfirm: () => void;
};

export function DiffPreviewDialog({ open, onOpenChange, downgrades, activeSubscribers, onConfirm }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          {/* TODO i18n: "Confirm destructive plan change" — no key in plans.* namespace */}
          <DialogTitle>Confirm destructive plan change</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {/* TODO i18n: "{n} active subscriber(s) will lose the following feature(s)..." — no key in plans.* namespace */}
            {activeSubscribers} active subscriber{activeSubscribers === 1 ? '' : 's'} will lose the
            following feature{downgrades.length === 1 ? '' : 's'} immediately on save:
          </p>
          <ul className="list-disc space-y-1 ps-5">
            {downgrades.map((k) => (
              <li key={k} className="font-medium">{FEATURE_CATALOG[k]?.nameEn ?? k}</li>
            ))}
          </ul>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {/* TODO i18n: "Cancel" — use common.cancel if plans.* has no key */}
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            {/* TODO i18n: "Confirm and save" — no key in plans.* namespace */}
            Confirm and save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
