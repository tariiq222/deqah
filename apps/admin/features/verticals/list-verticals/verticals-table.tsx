'use client';
// TODO Phase 6.7 follow-up: convert action buttons to icon-only + Tooltip (Pencil/Trash2 from lucide-react, size-9 rounded-sm)

import { Badge } from '@deqah/ui/primitives/badge';
import { Button } from '@deqah/ui/primitives/button';
import { Skeleton } from '@deqah/ui/primitives/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@deqah/ui/primitives/table';
import type { VerticalRow } from '../types';

interface Props {
  items: VerticalRow[] | undefined;
  isLoading: boolean;
  onEdit: (vertical: VerticalRow) => void;
  onDelete: (vertical: VerticalRow) => void;
}

export function VerticalsTable({ items, isLoading, onEdit, onDelete }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Slug</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Template family</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-24">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading && !items
          ? Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={5}>
                  <Skeleton className="h-6" />
                </TableCell>
              </TableRow>
            ))
          : items?.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="font-mono text-xs">{v.slug}</TableCell>
                <TableCell>
                  <div className="font-medium">{v.nameAr}</div>
                  <div className="text-xs text-muted-foreground">{v.nameEn}</div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{v.templateFamily}</TableCell>
                <TableCell>
                  {v.isActive ? (
                    <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Inactive
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onEdit(v)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => onDelete(v)}
                    >
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
        {!isLoading && items?.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
              No verticals defined. Create one using the button above.
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}
