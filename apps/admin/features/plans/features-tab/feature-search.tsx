'use client';
import { Input } from '@deqah/ui/primitives/input';
import { Label } from '@deqah/ui/primitives/label';

type Props = { value: string; onChange: (v: string) => void };

export function FeatureSearch({ value, onChange }: Props) {
  return (
    <div className="space-y-1">
      <Label htmlFor="feature-search" className="text-sm text-muted-foreground">
        {/* TODO i18n: "Search features" — no key in plans.* namespace */}
        Search features
      </Label>
      {/* TODO i18n: placeholder "Filter by name or description..." — no key in plans.* namespace */}
      <Input
        id="feature-search"
        type="search"
        placeholder="Filter by name or description..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
