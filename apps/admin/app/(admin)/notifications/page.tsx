'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@deqah/ui/primitives/button';
import { Input } from '@deqah/ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@deqah/ui/primitives/select';
import { useListDeliveryLog } from '@/features/notifications/list-delivery-log/use-list-delivery-log';
import { DeliveryLogTable } from '@/features/notifications/list-delivery-log/delivery-log-table';
import type { DeliveryLogFilters } from '@/features/notifications/list-delivery-log/list-delivery-log.api';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ErrorBanner } from '@/components/error-banner';

const PER_PAGE = 20;

interface StatCardProps {
  label: string;
  value: string | number;
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

export default function NotificationsPage() {
  const pathname = usePathname();
  const [page, setPage] = useState(1);
  const [organizationId, setOrganizationId] = useState('');
  const [status, setStatus] = useState('all');
  const [channel, setChannel] = useState('all');

  const filters: DeliveryLogFilters = {
    organizationId: organizationId || undefined,
    status,
    channel,
    page,
    perPage: PER_PAGE,
  };

  const { data, isLoading, error } = useListDeliveryLog(filters);

  const items = data?.items;
  const meta = data?.meta;

  const sentCount = items?.filter((i) => i.status === 'SENT').length ?? '—';
  const failedCount = items?.filter((i) => i.status === 'FAILED').length ?? '—';
  const pendingCount = items?.filter((i) => i.status === 'PENDING').length ?? '—';

  const isFiltered = organizationId !== '' || status !== 'all' || channel !== 'all';

  return (
    <div className="space-y-6">
      <Breadcrumbs pathname={pathname} />
      <div>
        <h2 className="text-2xl font-semibold">Notification Delivery Log</h2>
        <p className="text-sm text-muted-foreground">
          Monitor outbound notification delivery across all channels and organizations.
          Auto-refreshes every 30 seconds.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total" value={meta?.total ?? '—'} />
        <StatCard label="Sent (page)" value={sentCount} />
        <StatCard label="Failed (page)" value={failedCount} />
        <StatCard label="Pending (page)" value={pendingCount} />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card/50 px-4 py-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Organization ID</label>
          <Input
            placeholder="UUID..."
            value={organizationId}
            onChange={(e) => {
              setOrganizationId(e.target.value);
              setPage(1);
            }}
            className="w-56 font-mono text-xs"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="SENT">Sent</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="SKIPPED">Skipped</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Channel</label>
          <Select
            value={channel}
            onValueChange={(v) => {
              setChannel(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              <SelectItem value="EMAIL">Email</SelectItem>
              <SelectItem value="SMS">SMS</SelectItem>
              <SelectItem value="PUSH">Push</SelectItem>
              <SelectItem value="IN_APP">In-App</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            className="self-end"
            onClick={() => {
              setOrganizationId('');
              setStatus('all');
              setChannel('all');
              setPage(1);
            }}
          >
            Reset
          </Button>
        )}
      </div>

      {error ? (
        <ErrorBanner error={error} context="page:notifications" />
      ) : null}

      <DeliveryLogTable items={items} isLoading={isLoading} />

      {meta && meta.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {meta.totalPages} · {meta.total} total
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
