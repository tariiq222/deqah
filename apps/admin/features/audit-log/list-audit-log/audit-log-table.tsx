'use client';

import { Badge } from '@deqah/ui/primitives/badge';
import { Skeleton } from '@deqah/ui/primitives/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@deqah/ui/primitives/table';
import type { AuditLogEntry } from './list-audit-log.api';

interface Props {
  items: AuditLogEntry[] | undefined;
  isLoading: boolean;
}

export function AuditLogTable({ items, isLoading }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Organization</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>IP</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading && !items
          ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={`skeleton-row-${i}`}>
                <TableCell colSpan={5}>
                  <Skeleton className="h-6" />
                </TableCell>
              </TableRow>
            ))
          : items?.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-xs">
                    {entry.actionType}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {entry.organizationId ?? '—'}
                </TableCell>
                <TableCell className="max-w-md truncate text-sm">{entry.reason ?? '—'}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {entry.ipAddress || '—'}
                </TableCell>
              </TableRow>
            ))}
        {!isLoading && items?.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
              No audit entries match the current filters.
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}
