'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@deqah/ui/primitives/button';
import { useListVerticals } from '@/features/verticals/list-verticals/use-list-verticals';
import { VerticalsTable } from '@/features/verticals/list-verticals/verticals-table';
import { CreateVerticalDialog } from '@/features/verticals/create-vertical/create-vertical-dialog';
import { UpdateVerticalDialog } from '@/features/verticals/update-vertical/update-vertical-dialog';
import { DeleteVerticalDialog } from '@/features/verticals/delete-vertical/delete-vertical-dialog';
import type { VerticalRow } from '@/features/verticals/types';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ErrorBanner } from '@/components/error-banner';

// ─── Terminology detail panel ─────────────────────────────────────────────────

const TERMINOLOGY_KEYS = [
  'client', 'clients', 'employee', 'employees',
  'booking', 'bookings', 'service', 'services',
  'department', 'departments', 'branch', 'branches',
] as const;

function DetailPanel({
  vertical,
  onEdit,
}: {
  vertical: VerticalRow;
  onEdit: (v: VerticalRow) => void;
}) {
  const t = useTranslations('verticals');
  const verticalRecord = vertical as unknown as Record<string, string | null>;
  const rows = TERMINOLOGY_KEYS.map((k) => {
    const capKey = k.charAt(0).toUpperCase() + k.slice(1);
    return {
      key: k,
      ar: verticalRecord[`terminology${capKey}Ar`] ?? null,
      en: verticalRecord[`terminology${capKey}En`] ?? null,
    };
  });

  const hasTerminology = rows.some((r) => r.ar || r.en);

  return (
    <div className="flex flex-col gap-4 border-l border-border pl-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            {t('detail.selected')}
          </p>
          <h3 className="mt-1 text-base font-semibold">{vertical.nameEn}</h3>
          <p className="text-[13px] text-muted-foreground">{vertical.nameAr}</p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{vertical.slug}</p>
        </div>
        <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => onEdit(vertical)}>
          {t('detail.edit')}
        </Button>
      </div>

      {vertical.descriptionEn ? (
        <p className="text-[13px] text-muted-foreground">{vertical.descriptionEn}</p>
      ) : null}

      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          {t('detail.terminologyPack')}
        </p>
        {hasTerminology ? (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-1 pr-4 text-left font-medium text-muted-foreground">{t('detail.key')}</th>
                <th className="pb-1 pr-4 text-left font-medium text-muted-foreground">{t('detail.ar')}</th>
                <th className="pb-1 text-left font-medium text-muted-foreground">{t('detail.en')}</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((r) => r.ar || r.en)
                .map((r) => (
                  <tr key={r.key} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5 pr-4 font-mono text-[11px] text-muted-foreground">{r.key}</td>
                    <td className="py-1.5 pr-4">{r.ar ?? '—'}</td>
                    <td className="py-1.5">{r.en ?? '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            {t('detail.noTerminology')}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VerticalsPage() {
  const t = useTranslations('verticals');
  const pathname = usePathname();
  const { data, isLoading, error, refetch } = useListVerticals();
  const items = data?.items;

  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<VerticalRow | null>(null);
  const [editVertical, setEditVertical] = useState<VerticalRow | null>(null);
  const [deleteVertical, setDeleteVertical] = useState<VerticalRow | null>(null);

  return (
    <div className="space-y-5">
      <Breadcrumbs pathname={pathname} />

      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{t('title')}</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {t('description')}
          </p>
        </div>
        <Button size="sm" className="h-8" onClick={() => setCreateOpen(true)}>
          {t('createButton')}
        </Button>
      </div>

      {error ? (
        <ErrorBanner error={error} onRetry={() => void refetch()} context="page:verticals" />
      ) : null}

      {/* 2-pane layout — list left, detail right when a row is selected */}
      <div className={`grid gap-0 ${selected ? 'grid-cols-[1fr_320px]' : 'grid-cols-1'}`}>
        <div>
          <VerticalsTable
            items={items}
            isLoading={isLoading}
            selectedId={selected?.id}
            onSelect={(v) => setSelected((prev) => (prev?.id === v.id ? null : v))}
            onEdit={(v) => setEditVertical(v)}
            onDelete={(v) => setDeleteVertical(v)}
          />
        </div>

        {selected ? (
          <DetailPanel
            vertical={selected}
            onEdit={(v) => setEditVertical(v)}
          />
        ) : null}
      </div>

      <CreateVerticalDialog open={createOpen} onOpenChange={setCreateOpen} />

      {editVertical ? (
        <UpdateVerticalDialog
          open={editVertical !== null}
          onOpenChange={(open) => { if (!open) setEditVertical(null); }}
          vertical={editVertical}
        />
      ) : null}

      {deleteVertical ? (
        <DeleteVerticalDialog
          open={deleteVertical !== null}
          onOpenChange={(open) => { if (!open) setDeleteVertical(null); }}
          vertical={deleteVertical}
        />
      ) : null}
    </div>
  );
}
