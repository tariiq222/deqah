'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@deqah/ui/primitives/button';
import { useListVerticals } from '@/features/verticals/list-verticals/use-list-verticals';
import { VerticalsTable } from '@/features/verticals/list-verticals/verticals-table';
import { CreateVerticalDialog } from '@/features/verticals/create-vertical/create-vertical-dialog';
import { UpdateVerticalDialog } from '@/features/verticals/update-vertical/update-vertical-dialog';
import { DeleteVerticalDialog } from '@/features/verticals/delete-vertical/delete-vertical-dialog';
import type { VerticalRow } from '@/features/verticals/types';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ErrorBanner } from '@/components/error-banner';

export default function VerticalsPage() {
  const pathname = usePathname();
  const { data, isLoading, error, refetch } = useListVerticals();
  const items = data?.items;
  const [createOpen, setCreateOpen] = useState(false);
  const [editVertical, setEditVertical] = useState<VerticalRow | null>(null);
  const [deleteVertical, setDeleteVertical] = useState<VerticalRow | null>(null);

  return (
    <div className="space-y-6">
      <Breadcrumbs pathname={pathname} />
      {/* TODO Phase 6.4 follow-up: wire stats once BE list endpoint exposes counts */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Verticals</h2>
          <p className="text-sm text-muted-foreground">
            Clinic archetypes that drive terminology and seed content.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>+ Create Vertical</Button>
      </div>

      {error ? (
        <ErrorBanner error={error} onRetry={() => void refetch()} context="page:verticals" />
      ) : null}

      <VerticalsTable
        items={items}
        isLoading={isLoading}
        onEdit={(vertical) => setEditVertical(vertical)}
        onDelete={(vertical) => setDeleteVertical(vertical)}
      />

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
